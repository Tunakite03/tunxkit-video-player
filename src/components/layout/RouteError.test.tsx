import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteError } from "./RouteError";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error("library index is corrupt");
}

describe("RouteError", () => {
  it("replaces a page that failed to render, keeping the shell around it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <div>
              <nav>sidebar</nav>
              <Outlet />
            </div>
          ),
          children: [{ path: "library", element: <Broken />, errorElement: <RouteError /> }],
        },
      ],
      { initialEntries: ["/library"] },
    );
    render(<RouterProvider router={router} />);

    expect((await screen.findByRole("alert")).textContent).toContain("library index is corrupt");
    expect(screen.getByText("sidebar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      "page failed to render",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("reports an unknown path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [{ path: "/", element: <p>home</p>, errorElement: <RouteError /> }],
      { initialEntries: ["/nowhere"] },
    );
    render(<RouterProvider router={router} />);
    expect((await screen.findByRole("alert")).textContent).toContain("404");
    expect(screen.getByRole("button", { name: "Go to Home" })).toBeTruthy();
  });
});
