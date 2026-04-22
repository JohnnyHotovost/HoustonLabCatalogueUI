import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { loginAdmin, setStoredToken } from "../api";
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
      toast.error(error.response?.data?.detail || "Přihlášení se nepodařilo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.5rem] border-slate-200 p-0 sm:max-w-md" data-testid="admin-login-dialog">
        <div className="rounded-t-[1.5rem] bg-slate-900 px-6 py-6 text-white">
          <div className="mb-4 inline-flex rounded-full bg-white/10 p-3" data-testid="admin-login-icon">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-white" data-testid="admin-login-title">
              Přihlášení do správy
            </DialogTitle>
            <DialogDescription className="text-slate-300" data-testid="admin-login-description">
              Jen pro administrátora. Zaměstnanci vidí pouze rozcestník.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form className="space-y-4 px-6 pb-6 pt-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="admin-username">
              Uživatelské jméno
            </label>
            <Input
              id="admin-username"
              autoComplete="username"
              className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
              data-testid="admin-login-username-input"
              placeholder="Zadej jméno"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="admin-password">
              Heslo
            </label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
              data-testid="admin-login-password-input"
              placeholder="Zadej heslo"
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