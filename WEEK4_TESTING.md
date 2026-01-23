# Week 4: Testing & Polish

## Test Checklist

### 1. Extension Loading & Basics
- [ ] Extension loads without errors in Chrome
- [ ] All tabs (Overview, QuickStart, SourceMap, Settings) visible
- [ ] Tab switching works smoothly
- [ ] Settings tab displays correctly

### 2. Settings Tab Testing
- [ ] Claude provider option selectable
- [ ] OpenAI provider option selectable
- [ ] Ollama provider option selectable
- [ ] API key field shows as password
- [ ] Model field allows input
- [ ] Base URL field shows for Ollama
- [ ] Connection test button works
- [ ] Configuration saves to localStorage
- [ ] Configuration persists on reload
- [ ] Clear configuration button works

### 3. GitHub URL Detection
- [ ] Extracts owner/name correctly from github.com URLs
- [ ] Handles trailing slashes
- [ ] Handles /tree/branch URLs
- [ ] Handles different URL formats

### 4. Overview Tab
- [ ] Shows repo info (stars, language, description)
- [ ] Regex analysis shows basic project info
- [ ] AI analysis button visible when not configured
- [ ] AI analysis button disabled when provider not set
- [ ] AI analysis generates results
- [ ] Results show: core value, difficulty, audience, problems, use cases, features
- [ ] Results are cached correctly
- [ ] Results load from cache on revisit
- [ ] Regenerate button clears cache
- [ ] Difficulty badges show correct colors (green, yellow, red)
- [ ] Feature tags display as badges

### 5. QuickStart Tab
- [ ] Shows prerequisites from regex analysis
- [ ] AI analysis button works
- [ ] AI results show prerequisites list
- [ ] AI results show installation steps
- [ ] Steps are expandable
- [ ] Steps show commands with $ prefix
- [ ] First example section displays
- [ ] Code blocks are selectable
- [ ] Results cached correctly
- [ ] Regenerate button works

### 6. SourceMap Tab
- [ ] Shows architecture overview
- [ ] Shows file list with priorities
- [ ] AI analysis button works
- [ ] AI results show architecture
- [ ] AI results show key concepts
- [ ] AI results show file map with colors
- [ ] Critical files show red border
- [ ] Important files show yellow border
- [ ] Optional files show blue border
- [ ] Results cached correctly
- [ ] Regenerate button works

### 7. AI Provider Testing
- [ ] Claude API (if key available)
  - [ ] Connection test passes
  - [ ] Analysis generates meaningful results
  - [ ] Results are well-formatted
  
- [ ] OpenAI API (if key available)
  - [ ] Connection test passes
  - [ ] Analysis generates meaningful results
  - [ ] Results follow JSON schema

- [ ] Ollama (if local instance available)
  - [ ] Connection test passes
  - [ ] Basic analysis works

### 8. Language Support
- [ ] Chinese (zh) labels display correctly
  - [ ] Tabs show Chinese names
  - [ ] AI prompts use Chinese
  - [ ] Results display in Chinese
  
- [ ] English (en) labels display correctly
  - [ ] Tabs show English names
  - [ ] AI prompts use English
  - [ ] Results display in English

### 9. Error Handling
- [ ] Invalid GitHub URL shows error
- [ ] Network errors handled gracefully
- [ ] API key errors show helpful message
- [ ] Rate limit errors show message
- [ ] Missing README shows fallback
- [ ] AI timeouts handled

### 10. Performance
- [ ] Initial load time < 2s
- [ ] Tab switching < 500ms
- [ ] AI analysis < 30s (typical)
- [ ] Cache loads instantly
- [ ] No memory leaks after prolonged use

### 11. Visual & Animations
- [ ] Loading spinner displays smoothly
- [ ] Fade-in animation works
- [ ] Button hover states work
- [ ] Transitions are smooth
- [ ] Colors are consistent
- [ ] Text is readable (contrast)
- [ ] Responsive on different popup sizes

### 12. Integration Testing
- [ ] Test with various GitHub projects:
  - [ ] React (large, popular)
  - [ ] Express (backend)
  - [ ] Vue (frontend)
  - [ ] Next.js (framework)
  - [ ] Small indie project
  - [ ] Archived project
  - [ ] Project without README

### 13. Code Quality
- [ ] No TypeScript errors
- [ ] No console errors/warnings
- [ ] Proper error boundaries
- [ ] No memory leaks
- [ ] Efficient re-renders
- [ ] Proper component lifecycle

### 14. Build Output
- [ ] manifest.json correct
- [ ] popup.js properly bundled
- [ ] CSS minified
- [ ] No source maps in production
- [ ] File sizes reasonable
- [ ] All assets included

## Test Scenarios

### Scenario 1: First Time User
1. Install extension
2. Navigate to a GitHub repo
3. Open extension popup
4. See basic project info
5. Go to Settings
6. Configure Claude API key
7. Test connection
8. Return to Overview
9. Click AI Analysis
10. See detailed analysis

### Scenario 2: Quick Start Learning
1. User on React GitHub page
2. Open GitMentor
3. Go to QuickStart tab
4. Configure OpenAI provider
5. Generate quick start guide
6. Follow the installation steps
7. Run the first example

### Scenario 3: Source Code Navigation
1. User wants to learn Express codebase
2. Go to SourceMap tab
3. Generate source map
4. See file priority and architecture
5. Understand key concepts
6. Know where to start learning

## Known Limitations & Workarounds

- Ollama requires local setup
- API rate limits may apply
- Large projects might have slower analysis
- Chinese characters need UTF-8 support

## Performance Targets

- Initial popup load: < 2 seconds
- Tab navigation: < 500ms
- AI analysis: < 30 seconds
- Cache retrieval: < 100ms
- Build size: < 200KB (uncompressed), < 65KB (gzip)

## Success Criteria

✅ All core features working
✅ No critical bugs
✅ Smooth user experience
✅ Good error messages
✅ Proper caching
✅ Responsive UI
✅ Both languages supported
✅ At least one AI provider integration tested
