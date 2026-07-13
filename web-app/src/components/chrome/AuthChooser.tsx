"use client";

import { Button, Modal } from "@/components/ui";

interface AuthChooserProps {
  open: boolean;
  onClose: () => void;
  onRegister?: () => void;
  onLogin?: () => void;
  onRecover?: () => void;
}

/** Logged-out gateway: register / log in chooser (the wireframe's authModal). */
export function AuthChooser({
  open,
  onClose,
  onRegister,
  onLogin,
  onRecover,
}: AuthChooserProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join OurSay"
      subtitle="Register or log in to take part"
      headerAlign="center"
    >
      <div className="mt-2 space-y-3">
        <Button fullWidth onClick={onRegister}>
          Register
        </Button>
        <Button fullWidth variant="outline" onClick={onLogin}>
          Log In
        </Button>
        <button
          type="button"
          onClick={onRecover}
          className="block w-full text-center text-sm text-ink-soft underline underline-offset-2"
        >
          Trouble signing in? Recover account
        </button>
      </div>
    </Modal>
  );
}
