# CLAUDE.md

Project: one-to-one simulation site for a 4S1P DMEGC INR18650-26E bench rig (budget build) (Raspberry Pi 5 edge node), hosted on Vercel, base for a review paper.

Rules for every change:
- Model only the components in `docs/HARDWARE_SPEC.md` (design v1). No vehicle, large-pack or thermal-runaway physics.
- Every constant carries `source` and `ref`. Never invent a datasheet value; ask.
- Provisional, listing, assumed and VERIFY values show a "Provisional" badge; dependent traces show uncertainty bands.
- `npm test` and `python tools/validate_design.py` must pass before any commit.
- Keep `src/core/` framework-free; UI in `src/ui/`.
- Label model-to-model and model-to-measurement results differently.
- UI follows Apple's Human Interface Guidelines as written in `CLAUDE_CODE_PROMPT.md`; no bundled SF Pro files, no Apple branding.
