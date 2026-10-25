import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/data";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        All economy constants are editable here so the balance can be retuned if it drifts.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
