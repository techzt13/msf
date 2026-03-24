import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MSF_DIR = path.join(os.homedir(), '.msf');

function readIdentityFile(filename) {
  const filepath = path.join(MSF_DIR, filename);
  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath, 'utf8').trim();
  }
  return '';
}

function writeIdentityFile(filename, content) {
  fs.mkdirSync(MSF_DIR, { recursive: true });
  fs.writeFileSync(path.join(MSF_DIR, filename), content, 'utf8');
}

function buildSystemPrompt(msfName, userName) {
  const soul = readIdentityFile('soul.md');
  const user = readIdentityFile('user.md');
  const memory = readIdentityFile('memory.md');

  return `You are ${msfName}, a personal AI assistant.

${soul ? `## Your Soul\n${soul}` : ''}

${user ? `## Who You're Talking To\n${user}` : ''}

${memory ? `## Your Memory\n${memory}` : ''}

---

## Memory Commands
If the user says something like "remember that...", "add to your memory...", or "add to memory:", respond normally AND append the fact to your memory by including a special tag at the END of your response (after your normal reply):

[[MEMORY_UPDATE: <the fact to remember, written concisely>]]

If the user says "update your soul:" or "change your personality:", respond normally AND include:

[[SOUL_UPDATE: <the new trait or instruction to append to your soul>]]

If the user says "update user info:" or "add to my profile:", respond normally AND include:

[[USER_UPDATE: <the info to add to the user profile>]]

Only include these tags when explicitly asked. Keep them on their own line at the very end of your response. The UI will handle them silently — the user won't see the raw tags.`;
}

// Parse and apply identity update tags from AI response
function processIdentityUpdates(text, msfName) {
  let cleaned = text;

  // Memory update
  const memMatch = text.match(/\[\[MEMORY_UPDATE:\s*(.*?)\]\]/s);
  if (memMatch) {
    const fact = memMatch[1].trim();
    let memory = readIdentityFile('memory.md');
    const date = new Date().toISOString().split('T')[0];
    memory += `\n- [${date}] ${fact}`;
    writeIdentityFile('memory.md', memory);
    cleaned = cleaned.replace(memMatch[0], '').trim();
  }

  // Soul update
  const soulMatch = text.match(/\[\[SOUL_UPDATE:\s*(.*?)\]\]/s);
  if (soulMatch) {
    const trait = soulMatch[1].trim();
    let soul = readIdentityFile('soul.md');
    soul += `\n\n## Updated Behavior\n- ${trait}`;
    writeIdentityFile('soul.md', soul);
    cleaned = cleaned.replace(soulMatch[0], '').trim();
  }

  // User update
  const userMatch = text.match(/\[\[USER_UPDATE:\s*(.*?)\]\]/s);
  if (userMatch) {
    const info = userMatch[1].trim();
    let user = readIdentityFile('user.md');
    user += `\n- ${info}`;
    writeIdentityFile('user.md', user);
    cleaned = cleaned.replace(userMatch[0], '').trim();
  }

  return cleaned;
}

export async function startGateway(config) {
  const app = express();
  const port = config.get('port') || 3000;
  const msfName = config.get('msf_name') || 'MSF';
  const userName = config.get('user_name') || 'there';

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Get a fresh Copilot token (they expire every 30min)
  async function getCopilotToken() {
    const githubToken = config.get('copilot_token');
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error('Failed to get Copilot token — try running msf setup again');
    const data = await res.json();
    return data.token;
  }

  // Chat endpoint
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

      // Buffer the stream, process identity updates, then re-stream
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body;
      let fullText = '';
      const chunks = [];

      reader.on('data', chunk => chunks.push(chunk));
      reader.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const lines = raw.split('\n');

        // Collect full text
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            fullText += parsed.choices?.[0]?.delta?.content || '';
          } catch {}
        }

        // Process identity updates (strip tags from displayed text)
        const cleanedText = processIdentityUpdates(fullText, msfName);

        // Re-emit as a single SSE chunk with cleaned text
        const payload = JSON.stringify({
          choices: [{ delta: { content: cleanedText }, finish_reason: 'stop' }]
        });
        res.write(`data: ${payload}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      reader.on('error', err => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Config endpoint
  app.get('/api/config', (req, res) => {
    res.json({
      gateway_name: config.get('gateway_name') || 'MSF Gateway',
      msf_name: msfName,
      user_name: userName,
      theme: config.get('theme') || 'dark',
      port
    });
  });

  // Identity files endpoint (read)
  app.get('/api/identity/:file', (req, res) => {
    const allowed = ['soul.md', 'user.md', 'memory.md'];
    if (!allowed.includes(req.params.file)) return res.status(400).json({ error: 'Invalid file' });
    const content = readIdentityFile(req.params.file);
    res.json({ content });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(port, () => {});
}
