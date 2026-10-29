import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { AppShell } from "./AppShell";

const mounts = vi.hoisted(() => ({ count: 0, fail: false }));
vi.mock("@/pages/PlayerPage", () => ({
  PlayerPage: ({ active }: { active: boolean }) => {
    React.useEffect(() => {
      mounts.count++;
    }, []);
    if (mounts.fail) throw new Error("player exploded");
    return <div data-testid="player-page" data-active={String(active)} />;
  },
}));

afterEach(() => {
  cleanup();
  mounts.count = 0;
  mounts.fail = false;
  vi.restoreAllMocks();
});

function renderShell(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <p>home</p> },
          { path: "player", element: null },
          { path: "library", element: <p>library</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

describe("AppShell", () => {
  it("mounts the player on its first visit, not before", async () => {
    renderShell("/");
    expect(await screen.findByText("home")).toBeTruthy();
    expect(screen.queryByTestId("player-page")).toBeNull();
  });

  it("keeps the player mounted, hidden, while another page shows", async () => {
    const router = renderShell("/player");
    const page = await screen.findByTestId("player-page");
    expect(page.dataset.active).toBe("true");

    await act(() => router.navigate("/library"));
    expect(screen.getByText("library")).toBeTruthy();
    expect(screen.getByTestId("player-page")).toBe(page);
    expect(page.dataset.active).toBe("false");

    await act(() => router.navigate("/player"));
    expect(page.dataset.active).toBe("true");
    expect(mounts.count).toBe(1);
  });

  it("contains a player that fails to render, leaving the rest of the app usable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mounts.fail = true;
    const router = renderShell("/player");
    expect((await screen.findByRole("alert")).textContent).toContain("player exploded");
    expect(screen.getByRole("link", { name: /library/i })).toBeTruthy();

    // Off the player page its error screen is hidden along with it.
    await act(() => router.navigate("/library"));
    expect(screen.getByText("library")).toBeTruthy();
    expect(screen.getByRole("alert").closest(".hidden")).not.toBeNull();
  });
});
