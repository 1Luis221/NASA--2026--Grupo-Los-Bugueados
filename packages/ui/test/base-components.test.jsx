import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from '../src/index.js'

describe('cn', () => {
  it('combina clases y resuelve conflictos de Tailwind', () => {
    const hidden = false
    expect(cn('px-2', hidden && 'hidden', 'px-4', ['text-sm'])).toBe('px-4 text-sm')
  })
})

describe('Button', () => {
  it('es un botón accesible que responde a clic y teclado', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Enviar</Button>)

    const button = screen.getByRole('button', { name: 'Enviar' })
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('aplica variantes y respeta disabled', () => {
    render(
      <Button variant="destructive" disabled>
        Borrar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Borrar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('data-variant', 'destructive')
  })

  it('con asChild renderiza el elemento hijo (p. ej. un enlace)', () => {
    render(
      <Button asChild>
        <a href="/alertas">Ver alertas</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Ver alertas' })).toHaveAttribute('href', '/alertas')
  })
})

describe('Card, Badge, Skeleton y Alert', () => {
  it('renderizan su contenido', () => {
    render(
      <>
        <Card>
          <CardHeader>
            <CardTitle>Tripulación</CardTitle>
          </CardHeader>
          <CardContent>Contenido</CardContent>
        </Card>
        <Badge variant="secondary">Simulado</Badge>
        <Skeleton data-testid="skeleton" />
      </>,
    )
    expect(screen.getByText('Tripulación')).toBeInTheDocument()
    expect(screen.getByText('Simulado')).toHaveAttribute('data-slot', 'badge')
    expect(screen.getByTestId('skeleton')).toHaveClass('animate-pulse')
  })

  it('Alert se anuncia con role="alert"', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Sin conexión con la API</AlertDescription>
      </Alert>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión con la API')
  })
})

describe('Input, Textarea y Label', () => {
  it('asocian etiqueta y control, y reflejan el estado inválido', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" />
        <Label htmlFor="hours">Horas de sueño</Label>
        <Input id="hours" type="number" aria-invalid="true" />
      </>,
    )
    await user.type(screen.getByLabelText('Notas'), 'Todo bien')
    expect(screen.getByLabelText('Notas')).toHaveValue('Todo bien')
    expect(screen.getByLabelText('Horas de sueño')).toBeInvalid()
  })
})

describe('Select', () => {
  it('se abre con el teclado y permite elegir una opción', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <>
        <Label htmlFor="crew">Tripulante</Label>
        <Select onValueChange={onValueChange}>
          <SelectTrigger id="crew">
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Ana</SelectItem>
            <SelectItem value="k">Kenji</SelectItem>
          </SelectContent>
        </Select>
      </>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Tripulante' })
    trigger.focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('option', { name: 'Kenji' }))

    expect(onValueChange).toHaveBeenCalledWith('k')
    expect(trigger).toHaveTextContent('Kenji')
  })
})

describe('Table', () => {
  it('genera una tabla semántica con encabezados y título', () => {
    render(
      <Table>
        <TableCaption>Últimas lecturas</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Hora</TableHead>
            <TableHead>FC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>10:00</TableCell>
            <TableCell>72 bpm</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const table = screen.getByRole('table', { name: 'Últimas lecturas' })
    expect(table).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Hora', 'FC'])
  })
})
