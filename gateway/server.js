import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MSF_DIR = path.join(os.homedir(), '.msf');
const CONFIG_FILE = path.join(MSF_DIR, 'config.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function readFile(filename) {
  const fp = path.join(MSF_DIR, filename);
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8').trim() : '';
}

function writeFile(filename, content) {
  fs.writeFileSync(path.join(MSF_DIR, filename), content, 'utf8');
}

function readToken() {
  const tokenFile = path.join(MSF_DIR, 'copilot_token');
  if (!fs.existsSync(tokenFile)) throw new Error('No Copilot token found. Run: msf setup');
  return fs.readFileSync(tokenFile, 'utf8').trim();
}

function buildSystemPrompt(msfName, userName) {
  const soul = readFile('soul.md');
  const user = readFile('user.md');
  const memory = readFile('memory.md');

  return `You are ${msfName}, a personal AI assistant.

${soul ? `## Your Soul\n${soul}` : ''}

${user ? `## Who You're Talking To\n${user}` : ''}

${memory ? `## Your Memory\n${memory}` : ''}

---

## Memory Commands
If the user says "remember that...", "add to your memory...", or similar, append the fact to memory by including this tag at the END of your response:
[[MEMORY_UPDATE: <fact to remember, written concisely>]]

If the user says "update your soul:" or "change your personality:", include:
[[SOUL_UPDATE: <new trait or instruction>]]

If the user says "update user info:" or "add to my profile:", include:
[[USER_UPDATE: <info to add>]]

Only include these tags when explicitly asked. Keep them on their own line at the very end. They are processed silently — the user won't see them.`;
}

function processIdentityUpdates(text) {
  let cleaned = text;

  const memMatch = text.match(/\[\[MEMORY_UPDATE:\s*(.*?)\]\]/s);
  if (memMatch) {
    const fact = memMatch[1].trim();
    const date = new Date().toISOString().split('T')[0];
    let memory = readFile('memory.md');
    memory += `\n- [${date}] ${fact}`;
    writeFile('memory.md', memory);
    cleaned = cleaned.replace(memMatch[0], '').trim();
  }

  const soulMatch = text.match(/\[\[SOUL_UPDATE:\s*(.*?)\]\]/s);
  if (soulMatch) {
    const trait = soulMatch[1].trim();
    let soul = readFile('soul.md');
    soul += `\n\n## Updated Behavior\n- ${trait}`;
    writeFile('soul.md', soul);
    cleaned = cleaned.replace(soulMatch[0], '').trim();
  }

  const userMatch = text.match(/\[\[USER_UPDATE:\s*(.*?)\]\]/s);
  if (userMatch) {
    const info = userMatch[1].trim();
    let user = readFile('user.md');
    user += `\n- ${info}`;
    writeFile('user.md', user);
    cleaned = cleaned.replace(userMatch[0], '').trim();
  }

  return cleaned;
}

export async function startGateway() {
  const config = readConfig();
  const port = config.port || 3000;
  const msfName = config.msf_name || 'MSF';
  const userName = config.user_name || 'there';

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  async function getCopilotToken() {
    const githubToken = readToken();
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to refresh Copilot token. Run: msf setup');
    return (await res.json()).token;
  }

  // Chat
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      const copilotToken = await getCopilotToken();
      const systemPrompt = buildSystemPrompt(msfName, userName);

      const allMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        }))
      ];

      const response = await fetch('https://api.githubcopilot.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${copilotToken}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.12.0',
          'Copilot-Integration-Id': 'vscode-chat'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: allMessages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullText = '';
      const chunks = [];

      response.body.on('data', chunk => chunks.push(chunk));
      response.body.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            fullText += JSON.parse(data).choices?.[0]?.delta?.content || '';
          } catch {}
        }

        const cleaned = processIdentityUpdates(fullText);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: cleaned } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      response.body.on('error', err => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Config (safe fields only)
  app.get('/api/config', (req, res) => {
    const cfg = readConfig();
    res.json({
      gateway_name: cfg.gateway_name || 'MSF Gateway',
      msf_name: cfg.msf_name || 'MSF',
      user_name: cfg.user_name || 'there',
      theme: cfg.theme || 'dark',
      port: cfg.port || 3000
    });
  });

  // Read identity files
  app.get('/api/identity/:file', (req, res) => {
    const allowed = ['soul.md', 'user.md', 'memory.md'];
    if (!allowed.includes(req.params.file)) return res.status(400).json({ error: 'Invalid file' });
    res.json({ content: readFile(req.params.file) });
  });

  // Workspace file listing
  app.get('/api/workspace', (req, res) => {
    const wsDir = path.join(MSF_DIR, 'workspace');
    if (!fs.existsSync(wsDir)) return res.json({ files: [] });
    const files = fs.readdirSync(wsDir).filter(f => !f.startsWith('.'));
    res.json({ files });
  });

  // Read workspace file
  app.get('/api/workspace/:filename', (req, res) => {
    const fp = path.join(MSF_DIR, 'workspace', path.basename(req.params.filename));
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    res.json({ content: fs.readFileSync(fp, 'utf8') });
  });

  // Health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(port, () => {});
}
