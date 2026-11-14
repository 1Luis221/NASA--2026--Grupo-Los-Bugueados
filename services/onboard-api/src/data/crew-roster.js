/**
 * Tripulación FICTICIA para la simulación. Identificadores fijos para que los
 * datos sean reproducibles entre reinicios de la API.
 */
const ROSTER_DATE = '2026-11-01T00:00:00.000Z'

export const CREW_ROSTER = Object.freeze([
  {
    id: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d',
    name: 'Ana Torres',
    callsign: 'Nova',
    role: 'commander',
    agency: 'ESA',
    status: 'active',
    createdAt: ROSTER_DATE,
    updatedAt: ROSTER_DATE,
  },
  {
    id: '2b9e4d6f-8a1c-4e3b-a5d7-9f0e1c2b3a4d',
    name: 'Kenji Watanabe',
    callsign: 'Orbit',
    role: 'flight_engineer',
    agency: 'JAXA',
    status: 'active',
    createdAt: ROSTER_DATE,
    updatedAt: ROSTER_DATE,
  },
  {
    id: 'c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a',
    name: 'Maya Okafor',
    callsign: 'Atlas',
    role: 'medical_officer',
    agency: 'NASA',
    status: 'active',
    createdAt: ROSTER_DATE,
    updatedAt: ROSTER_DATE,
  },
])
