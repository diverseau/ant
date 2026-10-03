# Third-party notices

Ant is MIT licensed (see `LICENSE`). It also contains material from these projects.

## Hermes Agent (MIT)

Parts of Ant's server are ported from [Hermes Agent](https://github.com/NousResearch/hermes-agent) at commit `54bc5e50`: approval floors and dangerous-command detection, the skill linter and safety scanner, the memory store, the cron/quota-hold scheduler pieces, the bot loop guard, the Telegram and Slack channel adapters, and the Dockerfile. Each ported file says so in its first line.

```
MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Anthropic brand-guidelines skill (Apache-2.0)

`.agents/skills/brand-guidelines/` is the `brand-guidelines` skill from [anthropics/skills](https://github.com/anthropics/skills), included unmodified for Claude Code while developing Ant. Its licence is in that folder (`LICENSE.txt`).

## Anthropic wordmark

`animations/assets/source/anthropic-wordmark.svg` is from Wikimedia Commons ("File:Anthropic logo.svg", tagged PD-Textlogo). It is used only in the intro animation. "Anthropic" and "Claude" are trademarks of Anthropic, PBC; Ant is not affiliated with or endorsed by Anthropic.

## Dependencies

npm dependencies (Svelte, Hono, Playwright MCP, lucide icons, Fontsource Poppins and Lora, and others) are installed from npm under their own licences and are not vendored here.
