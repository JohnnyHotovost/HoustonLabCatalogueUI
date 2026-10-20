import { useEffect, useState } from "react";
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
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    if (!open) { setForm({ username: "", password: "" }); setErrorMessage(""); }
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setErrorMessage("");
    setLoading(true);

    try {
      const data = await loginAdmin({ ...form, username: form.username.trim() });
      setStoredToken(data.access_token);
      toast.success("Administrace je odemčená.");
      setForm({ username: "", password: "" });
      onSuccess();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Přihlášení se nepodařilo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-[1.5rem] border-slate-200 bg-white p-6 sm:max-w-sm" data-testid="admin-login-dialog">
        <DialogHeader className="text-left">
          <DialogTitle data-testid="admin-login-title">Přihlášení do administrace</DialogTitle>
          <DialogDescription id="admin-login-description">Přihlášení administrátora.</DialogDescription>
        </DialogHeader>

        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="admin-username" className="mb-2 block text-sm font-medium">Uživatelské jméno</label>
            <Input
              required
              minLength={3}
              maxLength={64}
              disabled={loading}
              id="admin-username"
              autoComplete="username"
              className="h-12 rounded-xl border-slate-200 bg-white text-base"
              data-testid="admin-login-username-input"
              placeholder="Uživatelské jméno"
              aria-label="Uživatelské jméno"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm font-medium">Heslo</label>
            <Input
              required
              minLength={4}
              maxLength={72}
              disabled={loading}
              id="admin-password"
              type="password"
              autoComplete="current-password"
              className="h-12 rounded-xl border-slate-200 bg-white text-base"
              data-testid="admin-login-password-input"
              placeholder="Heslo"
              aria-label="Heslo"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>

          {errorMessage ? <p role="alert" className="text-sm text-red-700" data-testid="admin-login-error">{errorMessage}</p> : null}

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