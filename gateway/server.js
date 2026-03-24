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

async function getCopilotToken() {
  const githubToken = readToken();
  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to refresh Copilot token. Run: msf setup');
  return (await res.json()).token;
}

// Perform a web search using Bing (available via Copilot's API)
async function webSearch(query, copilotToken) {
  try {
    const res = await fetch(`https://api.githubcopilot.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Accept': 'application/json',
        'Editor-Version': 'vscode/1.85.0',
        'Copilot-Integration-Id': 'vscode-chat'
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {}

  // Fallback: DuckDuckGo instant answer (no key needed)
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const results = [];
      if (data.AbstractText) results.push({ title: data.Heading, snippet: data.AbstractText, url: data.AbstractURL });
      if (data.RelatedTopics) {
        for (const t of data.RelatedTopics.slice(0, 5)) {
          if (t.Text) results.push({ snippet: t.Text, url: t.FirstURL });
        }
      }
      return { results };
    }
  } catch {}

  return null;
}

function buildSystemPrompt(msfName, userName) {
  const soul = readFile('soul.md');
  const user = readFile('user.md');
  const memory = readFile('memory.md');

  return `You are ${msfName}, a personal AI assistant with web search capability.

${soul ? `## Your Soul\n${soul}` : ''}

${user ? `## Who You're Talking To\n${user}` : ''}

${memory ? `## Your Memory\n${memory}` : ''}

---

## Web Search
When the user asks about current events, recent news, real-time info, prices, weather, or anything that benefits from up-to-date information, you will receive search results prepended to their message in the format:
[WEB SEARCH RESULTS for "query": ...]
Use those results naturally in your answer. Cite sources when relevant.

## Memory Commands
If the user says "remember that...", "add to your memory...", append the fact by including at the END of your response:
[[MEMORY_UPDATE: <fact, written concisely>]]

If the user says "update your soul:" or "change your personality:":
[[SOUL_UPDATE: <new trait or instruction>]]

If the user says "update user info:" or "add to my profile:":
[[USER_UPDATE: <info to add>]]

Only include these tags when explicitly asked. They are processed silently.`;
}

function processIdentityUpdates(text) {
  let cleaned = text;

  const memMatch = text.match(/\[\[MEMORY_UPDATE:\s*(.*?)\]\]/s);
  if (memMatch) {
    const date = new Date().toISOString().split('T')[0];
    let memory = readFile('memory.md');
    memory += `\n- [${date}] ${memMatch[1].trim()}`;
    writeFile('memory.md', memory);
    cleaned = cleaned.replace(memMatch[0], '').trim();
  }

  const soulMatch = text.match(/\[\[SOUL_UPDATE:\s*(.*?)\]\]/s);
  if (soulMatch) {
    let soul = readFile('soul.md');
    soul += `\n\n## Updated Behavior\n- ${soulMatch[1].trim()}`;
    writeFile('soul.md', soul);
    cleaned = cleaned.replace(soulMatch[0], '').trim();
  }

  const userMatch = text.match(/\[\[USER_UPDATE:\s*(.*?)\]\]/s);
  if (userMatch) {
    let user = readFile('user.md');
    user += `\n- ${userMatch[1].trim()}`;
    writeFile('user.md', user);
    cleaned = cleaned.replace(userMatch[0], '').trim();
  }

  return cleaned;
}

// Detect if a message needs a web search
function needsWebSearch(message) {
  const triggers = [
    /search (for|the web for)/i,
    /look up/i,
    /what('s| is) (the latest|happening|going on|current|today|now)/i,
    /current(ly)?/i,
    /latest( news)?/i,
    /recent(ly)?/i,
    /today'?s?/i,
    /right now/i,
    /news (about|on)/i,
    /weather/i,
    /price of/i,
    /stock price/i,
    /\b202[4-9]\b/,
  ];
  return triggers.some(r => r.test(message));
}

export async function startGateway() {
  const config = readConfig();
  const port = config.port || 3000;
  const msfName = config.msf_name || 'MSF';
  const userName = config.user_name || 'there';
  const model = config.model || 'gpt-4o';

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Chat
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      const copilotToken = await getCopilotToken();
      const systemPrompt = buildSystemPrompt(msfName, userName);

      // Check if last user message needs web search
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      let augmentedMessages = [...messages];

      if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
        const searchResults = await webSearch(lastUserMsg.content, copilotToken);
        if (searchResults?.results?.length > 0) {
          const resultText = searchResults.results
            .slice(0, 5)
            .map((r, i) => `${i + 1}. ${r.title ? `**${r.title}**` : ''} ${r.snippet || ''} ${r.url ? `(${r.url})` : ''}`)
            .join('\n');

          // Prepend search results to the last user message
          augmentedMessages = messages.map(m =>
            m === lastUserMsg
              ? { ...m, content: `[WEB SEARCH RESULTS for "${lastUserMsg.content}":\n${resultText}]\n\n${m.content}` }
              : m
          );
        }
      }

      const allMessages = [
        { role: 'system', content: systemPrompt },
        ...augmentedMessages.map(m => ({
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
          model,
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
          try { fullText += JSON.parse(data).choices?.[0]?.delta?.content || ''; } catch {}
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

  // Config
  app.get('/api/config', (req, res) => {
    const cfg = readConfig();
    res.json({
      gateway_name: cfg.gateway_name || 'MSF Gateway',
      msf_name: cfg.msf_name || 'MSF',
      user_name: cfg.user_name || 'there',
      theme: cfg.theme || 'dark',
      model: cfg.model || 'gpt-4o',
      port: cfg.port || 3000
    });
  });

  // Identity files
  app.get('/api/identity/:file', (req, res) => {
    const allowed = ['soul.md', 'user.md', 'memory.md'];
    if (!allowed.includes(req.params.file)) return res.status(400).json({ error: 'Invalid file' });
    res.json({ content: readFile(req.params.file) });
  });

  // Workspace
  app.get('/api/workspace', (req, res) => {
    const wsDir = path.join(MSF_DIR, 'workspace');
    if (!fs.existsSync(wsDir)) return res.json({ files: [] });
    res.json({ files: fs.readdirSync(wsDir).filter(f => !f.startsWith('.')) });
  });

  app.get('/api/workspace/:filename', (req, res) => {
    const fp = path.join(MSF_DIR, 'workspace', path.basename(req.params.filename));
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    res.json({ content: fs.readFileSync(fp, 'utf8') });
  });

  // Health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), model });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(port, () => {});
}
