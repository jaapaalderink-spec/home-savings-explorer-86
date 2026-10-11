import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw } from "lucide-react";
import { sessionStore } from "@/lib/home-savings/session";

/** Minder prominente volledige reset, alleen na bevestiging. Raakt verstuurde aanvragen nooit. */
export function ResetCalculation({ onDone }: { onDone?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-moss/60 underline-offset-2 hover:text-moss hover:underline"
        >
          <RotateCcw size={12} /> Nieuwe berekening starten
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nieuwe berekening starten?</AlertDialogTitle>
          <AlertDialogDescription>
            Weet je zeker dat je opnieuw wilt beginnen? Alle ingevulde gegevens en geselecteerde
            maatregelen worden verwijderd.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              sessionStore.reset();
              onDone?.();
            }}
          >
            Opnieuw beginnen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
