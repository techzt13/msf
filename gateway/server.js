import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startGateway(config) {
  const app = express();
  const port = config.get('port') || 3000;

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
    if (!res.ok) throw new Error('Failed to get Copilot token');
    const data = await res.json();
    return data.token;
  }

  // Chat endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, stream = true } = req.body;

      const copilotToken = await getCopilotToken();

      const response = await fetch('https://api.githubcopilot.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${copilotToken}`,
          'Content-Type': 'application/json',
          'Accept': stream ? 'text/event-stream' : 'application/json',
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.12.0',
          'Copilot-Integration-Id': 'vscode-chat'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          stream,
          temperature: 0.7,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        response.body.pipe(res);
      } else {
        const data = await response.json();
        res.json(data);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Config endpoint (read-only safe fields)
  app.get('/api/config', (req, res) => {
    res.json({
      gateway_name: config.get('gateway_name') || 'MSF Gateway',
      theme: config.get('theme') || 'dark',
      port
    });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Serve the UI for all other routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(port, () => {
    // Gateway is running
  });
}
