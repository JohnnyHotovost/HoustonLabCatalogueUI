import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export const CredentialsCard = ({ currentUsername, onSubmit, loading }) => {
  const [form, setForm] = useState({
    current_password: "",
    new_username: currentUsername || "",
    new_password: "",
  });

  useEffect(() => {
    setForm((current) => ({ ...current, new_username: currentUsername || "" }));
  }, [currentUsername]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (new TextEncoder().encode(form.new_password).length > 72) {
      toast.error("Heslo může mít nejvýše 72 bajtů. Zkrať jej prosím.");
      return;
    }
    const saved = await onSubmit({ ...form, new_username: form.new_username.trim() });
    if (saved) setForm((current) => ({ ...current, current_password: "", new_password: "" }));
  };

  return (
    <section className="panel-surface h-full p-6 md:p-7" data-testid="credentials-card">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-slate-900 p-3 text-white" data-testid="credentials-card-icon">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900" data-testid="credentials-card-title">
            Změna přihlášení
          </h2>
          <p className="text-sm text-slate-500" data-testid="credentials-card-description">
            Aktuální admin účet: <strong>{currentUsername || "admin"}</strong>
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="current-password">
            Aktuální heslo
          </label>
          <Input
            id="current-password"
            required
            autoComplete="current-password"
            minLength={4}
            maxLength={72}
            disabled={loading}
            type="password"
            value={form.current_password}
            onChange={(event) => setForm((current) => ({ ...current, current_password: event.target.value }))}
            className="h-12 rounded-xl border-slate-200 bg-slate-50"
            data-testid="credentials-current-password-input"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="new-username">
            Nové jméno
          </label>
          <Input
            id="new-username"
            required
            autoComplete="username"
            minLength={3}
            maxLength={64}
            disabled={loading}
            value={form.new_username}
            onChange={(event) => setForm((current) => ({ ...current, new_username: event.target.value }))}
            className="h-12 rounded-xl border-slate-200 bg-slate-50"
            data-testid="credentials-new-username-input"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="new-password">
            Nové heslo
          </label>
          <Input
            id="new-password"
            required
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            disabled={loading}
            type="password"
            value={form.new_password}
            onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
            className="h-12 rounded-xl border-slate-200 bg-slate-50"
            data-testid="credentials-new-password-input"
          />
        </div>

        <Button
          type="submit"
          className="w-full rounded-xl bg-slate-900 hover:bg-slate-800"
          data-testid="credentials-save-button"
          disabled={loading}
        >
          {loading ? "Ukládám..." : "Uložit nové přihlášení"}
        </Button>
      </form>
    </section>
  );
};