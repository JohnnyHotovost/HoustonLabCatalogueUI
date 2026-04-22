import { useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage, loginAdmin, setStoredToken } from "../api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

export const AdminLoginDialog = ({ open, onOpenChange, onSuccess }) => {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const data = await loginAdmin(form);
      setStoredToken(data.access_token);
      toast.success("Administrace je odemčená.");
      setForm({ username: "", password: "" });
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Přihlášení se nepodařilo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-[1.5rem] border-slate-200 bg-white p-6 sm:max-w-sm" data-testid="admin-login-dialog">
        <DialogHeader className="sr-only">
          <DialogTitle data-testid="admin-login-title">Admin login</DialogTitle>
          <DialogDescription id="admin-login-description">Přihlášení administrátora.</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <Input
              id="admin-username"
              autoComplete="username"
              className="h-12 rounded-xl border-slate-200 bg-white text-base"
              data-testid="admin-login-username-input"
              placeholder="Login"
              aria-label="Login"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </div>

          <div>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              className="h-12 rounded-xl border-slate-200 bg-white text-base"
              data-testid="admin-login-password-input"
              placeholder="Password"
              aria-label="Password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-xl bg-slate-900 text-base font-semibold hover:bg-slate-800"
            data-testid="admin-login-submit"
            disabled={loading}
          >
            {loading ? "Přihlašuji..." : "Přihlásit se"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};