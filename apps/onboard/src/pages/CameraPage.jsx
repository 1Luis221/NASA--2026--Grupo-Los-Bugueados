import { CameraOff, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, PageSection, StatusIndicator } from '@astronaut-wellness/ui'

/**
 * Pantalla preparatoria del análisis por cámara. No accede a la cámara, no pide
 * permisos y no genera métricas: solo describe la funcionalidad prevista.
 */
export function CameraPage() {
  return (
    <div className="space-y-6">
      <StatusIndicator tone="neutral" label="Pendiente de implementación" />

      <PageSection title="Análisis por cámara (previsto)">
        <div className="space-y-3 text-sm">
          <p>
            Se prevé estimar indicadores agregados de fatiga a partir del vídeo de la cámara de la cabina: frecuencia de parpadeo,
            proporción de tiempo con los ojos cerrados, bostezos y orientación de la cabeza, en ventanas de tiempo.
          </p>
          <p>
            El contrato ya define estas métricas (<span className="font-mono">CameraMetrics</span>), pero la nave todavía no las
            genera. Esta pantalla no activa la cámara ni solicita permisos.
          </p>
        </div>
      </PageSection>

      <Alert>
        <CameraOff aria-hidden="true" />
        <AlertTitle>Funcionalidad experimental</AlertTitle>
        <AlertDescription>
          Cuando exista, el análisis por cámara será orientativo y experimental: dependerá de la iluminación, del encuadre y del
          modelo de visión, y no servirá para diagnosticar. Sus resultados se mostrarán siempre identificados como tales.
        </AlertDescription>
      </Alert>

      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Privacidad</AlertTitle>
        <AlertDescription>
          Según el contrato, solo se enviarían a Tierra métricas agregadas: nunca imágenes, fotogramas ni vídeo.
        </AlertDescription>
      </Alert>
    </div>
  )
}
