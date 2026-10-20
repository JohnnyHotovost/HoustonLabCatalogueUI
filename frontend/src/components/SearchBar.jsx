import { ArrowDownWideNarrow, Lock, LockOpen, RotateCcw, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";

export const SearchBar = ({ value, onChange, sortMode, onSortChange, showCustomLock = false,
  customUnlocked = false, onToggleCustomLock, customLockDisabled = false,
  showCustomReset = false, onResetCustomOrder }) => (
  <section className="search-panel" data-testid="search-wrapper" aria-labelledby="catalogue-heading">
    <div className="search-heading-row">
      <h1 id="catalogue-heading">Katalogový rozcestník<span className="brand-dot" aria-hidden="true" /></h1>
      <span className="search-caption">Všechno po ruce.</span>
    </div>
    <div className="search-controls">
      <div className="search-field">
        <Search className="search-icon" aria-hidden="true" />
        <label htmlFor="catalogue-search" className="sr-only">Hledat katalog nebo web</label>
        <Input id="catalogue-search" type="search" value={value} onChange={(event) => onChange(event.target.value)}
          className="catalogue-search-input" data-testid="search-input" placeholder="Najdi katalog nebo web…" autoComplete="off" />
        {value ? <button type="button" className="search-clear" aria-label="Vymazat hledání" onClick={() => onChange("")}><X className="h-4 w-4" /></button> : null}
      </div>
      <div className="search-sort-controls">
        <Select value={sortMode} onValueChange={onSortChange}>
          <SelectTrigger className="catalogue-sort-select" data-testid="search-sort-select" aria-label="Řazení odkazů">
            <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><SelectValue placeholder="Řazení" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alphabetical">A–Z</SelectItem>
            <SelectItem value="clicks">Nejnavštěvovanější</SelectItem>
            <SelectItem value="latest">Nejnovější</SelectItem>
            <SelectItem value="custom">Vlastní pořadí</SelectItem>
          </SelectContent>
        </Select>
        {showCustomLock ? <button type="button" onClick={onToggleCustomLock} disabled={customLockDisabled}
          className={`order-button${customUnlocked ? " order-button-active" : ""}`} data-testid="custom-order-lock-toggle"
          aria-label={customUnlocked ? "Uložit a zamknout vlastní pořadí" : "Odemknout vlastní pořadí"} aria-pressed={customUnlocked}>
          {customUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button> : null}
        {showCustomReset ? <button type="button" onClick={onResetCustomOrder} className="order-button" data-testid="custom-order-reset-button" aria-label="Obnovit výchozí pořadí" title="Obnovit výchozí pořadí"><RotateCcw className="h-4 w-4" /></button> : null}
      </div>
    </div>
  </section>
);
