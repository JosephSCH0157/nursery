import assert from "node:assert/strict";
import {
  editorModeToToolSelection,
  editorModeToVisualTool,
  resolveEditorModeFromPass,
} from "../src/editor/hammerWorkspaceShellCore";

{
  const selection = editorModeToToolSelection("images");
  assert.equal(selection.activeTool, "video");
  assert.equal(selection.activeVisualTool, null);
}

{
  assert.equal(resolveEditorModeFromPass("visual_finishing"), "images");
  assert.equal(editorModeToVisualTool("images", "visual_finishing"), "polish");
  assert.equal(editorModeToVisualTool("images", "image_placement"), "images");
  assert.equal(editorModeToVisualTool("broll", "image_animation"), "broll");
}

{
  const modeToolSelection = editorModeToToolSelection("images");
  const activeVisualTool = modeToolSelection.activeVisualTool
    ?? editorModeToVisualTool("images", "visual_finishing");
  assert.equal(activeVisualTool, "polish");
}

// eslint-disable-next-line no-console
console.log("Hammer visual mode routing tests passed.");
