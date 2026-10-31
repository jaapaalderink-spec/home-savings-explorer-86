import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  companyName?: string
  invoiceNumber?: string
  period?: string
  amount?: string
  dueDate?: string
  invoicesUrl?: string
}

const Email = ({ companyName, invoiceNumber, period, amount, dueDate, invoicesUrl }: Props) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Uw factuur{period ? ` over ${period}` : ''} staat klaar</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Uw factuur staat klaar</Heading>
        <Text style={text}>{companyName ? `Beste ${companyName},` : 'Beste partner,'}</Text>
        <Text style={text}>
          Factuur {invoiceNumber ?? ''}{period ? ` over ${period}` : ''} staat klaar in uw partnerportaal.
          {amount ? ` Te betalen: ${amount}` : ''}{dueDate ? `, uiterlijk ${dueDate}` : ''}.
        </Text>
        <Text style={text}>U kunt de factuur daar bekijken, downloaden en direct betalen.</Text>
        <Button style={button} href={invoicesUrl ?? 'https://onafhankelijke-offerte.nl/facturen'}>
          Bekijk factuur
        </Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Factuur ${d['invoiceNumber'] ?? ''} staat klaar`,
  displayName: 'Factuur klaar (installateur)',
  previewData: { companyName: 'Zon BV', invoiceNumber: '202609-A41D40', period: 'september 2026', amount: '€ 301,29', dueDate: '14-11-2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = { color: '#1e293b', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' }
const button = { backgroundColor: '#1e293b', color: '#ffffff', borderRadius: '6px', fontSize: '15px', padding: '12px 20px', textDecoration: 'none', display: 'inline-block' }
