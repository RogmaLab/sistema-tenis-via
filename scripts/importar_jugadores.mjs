// Script standalone para importar jugadores en bloque (ej. desde un Excel
// que pasaste antes a un array JSON acá abajo). Se corre aparte de la app
// Next.js, directo con Node (no necesita compilar TypeScript):
//
//   node scripts/importar_jugadores.mjs
//
// Requiere estas variables en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL       -> la misma URL que ya usa la app
//   SUPABASE_SERVICE_ROLE_KEY      -> Service Role Key de Supabase
//                                     (Project Settings > API > service_role)
//
// OJO: la Service Role Key salta las políticas de RLS. Es justo lo que
// queremos para una carga masiva desde este script, pero NUNCA la pongas en
// una variable NEXT_PUBLIC_* ni la uses en código que corra en el navegador.

import dotenv from "dotenv";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

// Polyfill: Node 20 no trae WebSocket nativo (recién llega en Node 22), y el
// cliente de Supabase lo necesita internamente. Lo asignamos globalmente
// antes de crear el cliente para evitar el error "native WebSocket not found".
globalThis.WebSocket = WebSocket;

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Datos a importar: un objeto por jugador, con las columnas tal como vienen
// del Excel. "categoria" y "genero" se cargan a mano en cada bloque porque
// el Excel no los trae armados igual que en la app.
//
// Ejemplo (descomentar, completar con las filas reales y borrar la línea
// "const jugadoresAImportar = [];" de más abajo):
//
// const jugadoresAImportar = [
//   {
//     NOMBRE: "Juan",
//     APELLIDO: "Pérez",
//     "numero de telefono": "+549111234567",
//     categoria: "3ra",
//     genero: "Masculino",
//   },
//   {
//     NOMBRE: "María",
//     APELLIDO: "Gómez",
//     "numero de telefono": "+549111234568",
//     categoria: "4ta",
//     genero: "Femenino",
//   },
//   {
//     NOMBRE: "Carlos",
//     APELLIDO: "Fernández",
//     "numero de telefono": "+549111234569",
//     categoria: "2da",
//     genero: "Masculino",
//   },
//   {
//     NOMBRE: "Lucía",
//     APELLIDO: "Martínez",
//     "numero de telefono": "+549111234570",
//     categoria: "5ta",
//     genero: "Femenino",
//   },
// ];
// ---------------------------------------------------------------------------

const jugadoresAImportar = [
  {
    NOMBRE: "Camila",
    APELLIDO: "Landaburu",
    "numero de telefono": "5492284221072",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Lucia",
    APELLIDO: "Bonicatto",
    "numero de telefono": "5492216037430",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Patricia",
    APELLIDO: "Nizzo",
    "numero de telefono": "5492215018313",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Antonela",
    APELLIDO: "Cuartucci",
    "numero de telefono": "5492216220573",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Paloma",
    APELLIDO: "Ayala",
    "numero de telefono": "5492214817249",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Fiona",
    APELLIDO: "Bartoletti",
    "numero de telefono": "5492215726840",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Milagros",
    APELLIDO: "Cuevas",
    "numero de telefono": "5492215990675",
    categoria: "5ta",
    genero: "Femenino",
  },
  {
    NOMBRE: "Jazmin",
    APELLIDO: "Alba",
    "numero de telefono": "5492213589246",
    categoria: "5ta",
    genero: "Femenino",
  },
];

async function importarJugadores() {
  if (jugadoresAImportar.length === 0) {
    console.log(
      'No hay jugadores cargados. Completá el array "jugadoresAImportar" (ver el ejemplo comentado arriba) y volvé a correr el script.'
    );
    return;
  }

  console.log(`Importando ${jugadoresAImportar.length} jugadores...\n`);

  let exitosos = 0;
  let fallidos = 0;

  for (const fila of jugadoresAImportar) {
    const nombreCompleto = `${fila.NOMBRE ?? ""} ${fila.APELLIDO ?? ""}`.trim();
    const whatsapp = fila["numero de telefono"] ?? "";
    const { categoria, genero } = fila;

    if (!nombreCompleto || !whatsapp || !categoria || !genero) {
      console.error("Fila incompleta, se salteó:", fila);
      fallidos++;
      continue;
    }

    // La tabla "jugadores" en Supabase usa las columnas nombre_completo y
    // whatsapp (no "nombre" ni "telefono"): mantenemos esos nombres para
    // que coincida con el esquema que ya usa el resto de la app.
    const { error } = await supabase.from("jugadores").insert({
      nombre_completo: nombreCompleto,
      whatsapp,
      categoria,
      genero,
    });

    if (error) {
      console.error(`✗ Error al importar a "${nombreCompleto}":`, error.message);
      fallidos++;
    } else {
      console.log(`✓ Importado: ${nombreCompleto}`);
      exitosos++;
    }
  }

  console.log(`\nListo. ${exitosos} importados, ${fallidos} con error.`);
}

importarJugadores();
