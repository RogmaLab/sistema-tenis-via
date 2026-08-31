import { snapHoraAMediaHora } from "@/lib/datetime";
import { CANCHAS_TORNEO } from "@/lib/types";

export type DiaFinDeSemana = "sabado" | "domingo";

export interface VentanaCancha {
  dia: DiaFinDeSemana;
  cancha: string;
  hora_inicio: string; // "HH:MM"
  hora_fin: string;
}

export interface ConfigProgramacionTorneo {
  torneo_id: string;
  duracion_minutos: 60 | 90;
  ventanas: VentanaCancha[];
  disponibilidad_abierta?: boolean;
  disponibilidad_habilitada_at?: string | null;
}

export interface BloqueDisponibilidad {
  id: string;
  hora_inicio: string;
  hora_fin: string;
  canchas: string[];
}

export interface DiaDisponibilidadDraft {
  activo: boolean;
  bloques: BloqueDisponibilidad[];
}

export interface DisponibilidadDraft {
  duracion_minutos: 60 | 90;
  sabado: DiaDisponibilidadDraft;
  domingo: DiaDisponibilidadDraft;
}

function idBloque() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `bloque-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function minutosDeHora(hora: string) {
  const [hh, mm] = snapHoraAMediaHora(hora).split(":").map(Number);
  return hh * 60 + mm;
}

function horaDesdeMinutos(total: number) {
  const acotado = Math.max(0, Math.min(23 * 60 + 30, total));
  const hh = Math.floor(acotado / 60);
  const mm = acotado % 60 >= 30 ? 30 : 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function crearBloque(
  parcial?: Partial<Omit<BloqueDisponibilidad, "id">>
): BloqueDisponibilidad {
  return {
    id: idBloque(),
    hora_inicio: parcial?.hora_inicio ?? "09:00",
    hora_fin: parcial?.hora_fin ?? "10:30",
    canchas: parcial?.canchas ? [...parcial.canchas] : [...CANCHAS_TORNEO],
  };
}

export function crearBloqueSiguiente(
  ultimo?: BloqueDisponibilidad
): BloqueDisponibilidad {
  if (!ultimo) return crearBloque();
  const inicio = snapHoraAMediaHora(ultimo.hora_fin);
  const fin = horaDesdeMinutos(minutosDeHora(inicio) + 90);
  return crearBloque({
    hora_inicio: inicio,
    hora_fin: fin <= inicio ? "23:30" : fin,
    canchas: [...ultimo.canchas],
  });
}

function diaVacio(activo: boolean): DiaDisponibilidadDraft {
  return {
    activo,
    bloques: [crearBloque({ hora_inicio: "09:00", hora_fin: "18:00" })],
  };
}

export const DISPONIBILIDAD_VACIA: DisponibilidadDraft = {
  duracion_minutos: 90,
  sabado: diaVacio(true),
  domingo: diaVacio(true),
};

export function timePgAHora(valor: string) {
  return valor.slice(0, 5);
}

export function draftDesdeConfig(
  config: ConfigProgramacionTorneo | null
): DisponibilidadDraft {
  if (!config) return structuredClone(DISPONIBILIDAD_VACIA);

  const armarDia = (dia: DiaFinDeSemana): DiaDisponibilidadDraft => {
    const deDia = config.ventanas.filter((ventana) => ventana.dia === dia);
    if (deDia.length === 0) return diaVacio(false);

    const grupos = new Map<string, BloqueDisponibilidad>();
    for (const ventana of deDia) {
      const clave = `${ventana.hora_inicio}|${ventana.hora_fin}`;
      const existente = grupos.get(clave);
      if (existente) {
        if (!existente.canchas.includes(ventana.cancha)) {
          existente.canchas.push(ventana.cancha);
        }
      } else {
        grupos.set(
          clave,
          crearBloque({
            hora_inicio: ventana.hora_inicio,
            hora_fin: ventana.hora_fin,
            canchas: [ventana.cancha],
          })
        );
      }
    }

    return {
      activo: true,
      bloques: [...grupos.values()].sort(
        (a, b) => minutosDeHora(a.hora_inicio) - minutosDeHora(b.hora_inicio)
      ),
    };
  };

  return {
    duracion_minutos: config.duracion_minutos,
    sabado: armarDia("sabado"),
    domingo: armarDia("domingo"),
  };
}

export function ventanasDesdeDraft(
  draft: DisponibilidadDraft
): VentanaCancha[] {
  const ventanas: VentanaCancha[] = [];
  const dias: DiaFinDeSemana[] = ["sabado", "domingo"];
  for (const dia of dias) {
    const diaDraft = draft[dia];
    if (!diaDraft.activo) continue;
    for (const bloque of diaDraft.bloques) {
      for (const cancha of bloque.canchas) {
        ventanas.push({
          dia,
          cancha,
          hora_inicio: snapHoraAMediaHora(bloque.hora_inicio),
          hora_fin: snapHoraAMediaHora(bloque.hora_fin),
        });
      }
    }
  }
  return ventanas;
}

export function validarDraft(draft: DisponibilidadDraft): string | null {
  const dias: { clave: DiaFinDeSemana; label: string }[] = [
    { clave: "sabado", label: "sábado" },
    { clave: "domingo", label: "domingo" },
  ];

  for (const { clave, label } of dias) {
    const diaDraft = draft[clave];
    if (!diaDraft.activo) continue;
    if (diaDraft.bloques.length === 0) {
      return `Agregá al menos un tramo libre el ${label}, o desmarcá el día.`;
    }

    for (let i = 0; i < diaDraft.bloques.length; i += 1) {
      const bloque = diaDraft.bloques[i];
      if (minutosDeHora(bloque.hora_fin) <= minutosDeHora(bloque.hora_inicio)) {
        return `En ${label}, el tramo ${i + 1}: la hora de fin tiene que ser posterior a la de inicio.`;
      }
      if (bloque.canchas.length === 0) {
        return `En ${label}, el tramo ${i + 1} necesita al menos una cancha.`;
      }
    }

    for (const cancha of CANCHAS_TORNEO) {
      const deCancha = diaDraft.bloques.filter((bloque) =>
        bloque.canchas.includes(cancha)
      );
      for (let i = 0; i < deCancha.length; i += 1) {
        for (let j = i + 1; j < deCancha.length; j += 1) {
          const a = deCancha[i];
          const b = deCancha[j];
          if (
            minutosDeHora(a.hora_inicio) < minutosDeHora(b.hora_fin) &&
            minutosDeHora(b.hora_inicio) < minutosDeHora(a.hora_fin)
          ) {
            return `En ${label}, ${cancha} tiene tramos que se pisan. Dejá el hueco de la clase afuera.`;
          }
        }
      }
    }
  }

  if (ventanasDesdeDraft(draft).length === 0) {
    return "Activá al menos un día con un tramo libre y una cancha.";
  }

  return null;
}
