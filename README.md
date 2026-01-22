# GitMentor - GitHub Project Learning Assistant

A browser extension to help developers understand, use, and learn GitHub projects faster.

**Goal**: Help users complete assessment of a GitHub project in 5-10 minutes: "Should I learn this? How do I use it? Where do I start reading the source code?"

## Features (MVP)

- 📋 **Project Overview** - Understand project core value in seconds
- 🚀 **Quick Start Guide** - Find the shortest path from 0 to 1
- 🗺️ **Source Code Learning Map** - Clear reading path for source code

### Coming Soon (V2)

- 🔧 Advanced Code Analysis (Optional)
- 🌍 Multi-language Support (中文 + 日本語)
- 📊 Project Comparison
- 📝 Learning Progress Tracking

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Extension**: Chrome Manifest V3
- **State Management**: Zustand
- **API**: GitHub REST API

## Development

### Setup

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

Then load the `dist` folder as an unpacked extension in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` folder

### Build for Production

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

### Lint

```bash
npm run lint
```

## Project Structure

```
src/
├── popup/           # Extension popup UI
├── components/      # React components
├── hooks/          # Custom React hooks
├── services/       # API services
├── background/     # Service worker
└── content-script/ # DOM injection script
```

## Roadmap

- Week 1: Framework setup + Overview Tab
- Week 2: Quick Start Tab
- Week 3: Source Map Tab
- Week 4: Polish + Advanced features

## License

MIT

## Author

GitMentor Team
