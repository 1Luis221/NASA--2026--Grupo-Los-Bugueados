/** Matriz 4×4 identidad (almacenada por columnas, como en MediaPipe). */
export function identity() {
  return { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
}

/** Matriz por columnas de una rotación alrededor del eje Y (giro). */
export function yawMatrix(deg) {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  // Filas: [c 0 s 0; 0 1 0 0; -s 0 c 0; 0 0 0 1] → almacenada por columnas.
  return { rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1] }
}

/** Resultado con la forma de FaceLandmarkerResult de MediaPipe. */
export function faceResult({ blinkL = 0.1, blinkR = 0.1, jaw = 0.05, matrix = identity() } = {}) {
  return {
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    faceBlendshapes: [
      {
        categories: [
          { categoryName: 'eyeBlinkLeft', score: blinkL },
          { categoryName: 'eyeBlinkRight', score: blinkR },
          { categoryName: 'jawOpen', score: jaw },
        ],
      },
    ],
    facialTransformationMatrixes: [matrix],
  }
}
