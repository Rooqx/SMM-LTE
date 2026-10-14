import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient, signUp } from "@/lib/auth-client";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
}));

describe("account access flows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the same recovery result when the backend rejects the email", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.requestPasswordReset).mockRejectedValue(new Error("unknown"));
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "missing@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText(/If an account exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument();
  });

  it("validates registration passwords before calling the backend", async () => {
    const user = userEvent.setup();
    render(<RegisterForm nextPath="/" />);

    await user.type(screen.getByLabelText("Your name"), "Amina");
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "12345");
    await user.type(screen.getByLabelText("Confirm password"), "12345");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("between 6 and 128");
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it("accepts a six-character registration password", async () => {
    const user = userEvent.setup();
    vi.mocked(signUp.email).mockResolvedValue({ error: null } as never);
    render(<RegisterForm nextPath="/" />);

    await user.type(screen.getByLabelText("Your name"), "Amina");
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "123456");
    await user.type(screen.getByLabelText("Confirm password"), "123456");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUp.email).toHaveBeenCalledWith(expect.objectContaining({
      password: "123456",
    }));
  });

  it("reveals and hides password fields without changing their values", async () => {
    const user = userEvent.setup();
    render(<LoginForm nextPath="/" />);
    const password = screen.getByLabelText("Password");

    await user.type(password, "secret");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("secret");
  });

  it("rejects a reset form without a token", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={null} />);

    await user.type(screen.getByLabelText("New password"), "a-secure-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-secure-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("missing or invalid");
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });
});
