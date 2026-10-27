import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/** Pretend `stage` is shown fullscreen: then only its subtree is painted. */
function enterFullscreen(stage: Element) {
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => stage });
}

afterEach(() => {
  cleanup();
  delete (document as Partial<Document> & { fullscreenElement?: Element | null }).fullscreenElement;
  document.body.replaceChildren();
});

function SpeedMenu() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Speed</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>2×</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("popups in fullscreen", () => {
  it("open menus inside the fullscreen element", () => {
    const stage = document.body.appendChild(document.createElement("div"));
    enterFullscreen(stage);
    render(<SpeedMenu />);
    expect(stage.contains(screen.getByText("2×"))).toBe(true);
  });

  it("open dialogs inside the fullscreen element", () => {
    const stage = document.body.appendChild(document.createElement("div"));
    enterFullscreen(stage);
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(stage.contains(screen.getByText("Keyboard shortcuts"))).toBe(true);
  });

  it("still open on the page body outside fullscreen", () => {
    const stage = document.body.appendChild(document.createElement("div"));
    render(<SpeedMenu />);
    const item = screen.getByText("2×");
    expect(stage.contains(item)).toBe(false);
    expect(document.body.contains(item)).toBe(true);
  });
});
