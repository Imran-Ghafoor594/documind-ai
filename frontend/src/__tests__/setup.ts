import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = ResizeObserverStub;
window.scrollTo = vi.fn() as any;
window.confirm = vi.fn(() => true);

afterEach(() => { cleanup(); });
