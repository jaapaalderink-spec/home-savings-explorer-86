import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  companyName?: string
  invoiceNumber?: string
  amount?: string
  dueDate?: string
  daysOpen?: number
  invoicesUrl?: string
}

const Email = ({ companyName, invoiceNumber, amount, dueDate, daysOpen, invoicesUrl }: Props) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Herinnering: factuur {invoiceNumber ?? ''} is nog niet betaald</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Betalingsherinnering</Heading>
        <Text style={text}>{companyName ? `Beste ${companyName},` : 'Beste partner,'}</Text>
        <Text style={text}>
          Wij hebben factuur {invoiceNumber ?? ''} nog niet van u ontvangen
          {daysOpen ? ` (${daysOpen} dagen open)` : ''}.{amount ? ` Openstaand: ${amount}` : ''}
          {dueDate ? `, vervaldatum ${dueDate}` : ''}.
        </Text>
        <Text style={text}>
          Bij twee of meer vervallen facturen wordt uw account tijdelijk gepauzeerd en ontvangt u geen nieuwe aanvragen.
          Na betaling wordt uw account automatisch weer actief.
        </Text>
        <Button style={button} href={invoicesUrl ?? 'https://onafhankelijke-offerte.nl/facturen'}>
          Factuur betalen
        </Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Herinnering: factuur ${d['invoiceNumber'] ?? ''} staat nog open`,
  displayName: 'Betalingsherinnering (installateur)',
  previewData: { companyName: 'Zon BV', invoiceNumber: '202609-A41D40', amount: '€ 301,29', dueDate: '14-10-2026', daysOpen: 30 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = { color: '#1e293b', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' }
const button = { backgroundColor: '#1e293b', color: '#ffffff', borderRadius: '6px', fontSize: '15px', padding: '12px 20px', textDecoration: 'none', display: 'inline-block' }
