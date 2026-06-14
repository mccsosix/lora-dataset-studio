# LoRA Dataset Studio

- Build the product as a local-first dataset preparation workspace.
- Use TypeScript and React.
- Keep model-provider code behind a small adapter boundary.
- Preserve original model output separately from edited captions.
- Treat Danbooru tags as structured data with category and confidence.
- Normalize generated captions to lowercase underscore-separated Danbooru tags.
- Export caption files as comma-and-space separated Danbooru tags.
- Read `docs/interactive-3d-workspace-design-guide.md` before major visual redesigns.
- Use its immersive design principles as inspiration, but keep core dataset actions obvious and beginner-friendly.
- Prefer a complete, testable user workflow over placeholder screens.
- Run `npm run build` after meaningful changes.
- Explain important architecture decisions, but implement routine details directly.
