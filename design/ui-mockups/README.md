# UI mockups

Final UI mockups for V1, exported from the design canvas at https://claude.ai/artifact/XspUzTusNdZ17V6jtr21nN (the canvas is the live, editable copy).

- `ui.css` holds the tokens and components: shadcn preset `bcivVQBO` (Nova style, zinc, IBM Plex Sans, lucide icons), with a `.dark` theme block.
- `canvas.json` lists every screen and its position on the canvas.
- Each `*.dc.html` file is one screen. Dialog screens embed the screen behind them with `<dc-import>`, and `*Dark.dc.html` embeds its light screen inside `.dark`.

These files need the canvas runtime (`support.js`) to render, so open the canvas link to view them. Treat them as a visual reference, not production code.
