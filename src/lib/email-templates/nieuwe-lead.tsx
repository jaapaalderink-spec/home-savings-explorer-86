import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  companyName?: string
  categories?: string
  city?: string
  postcode?: string
  dashboardUrl?: string
}

const Email = ({ companyName, categories, city, postcode, dashboardUrl }: Props) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Nieuwe aanvraag{categories ? `: ${categories}` : ''}{city ? ` in ${city}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Nieuwe aanvraag binnengekomen</Heading>
        <Text style={text}>{companyName ? `Beste ${companyName},` : 'Beste partner,'}</Text>
        <Text style={text}>
          Er is een nieuwe aanvraag aan u toegewezen
          {categories ? ` voor ${categories}` : ''}
          {city || postcode ? ` in ${[postcode, city].filter(Boolean).join(' ')}` : ''}.
        </Text>
        <Text style={text}>
          U vindt het volledige dossier en de contactgegevens van de klant in uw
          partnerdashboard. Neem snel contact op voor de beste kans op een opdracht.
        </Text>
        <Button style={button} href={dashboardUrl ?? 'https://onafhankelijke-offerte.nl/dashboard'}>
          Bekijk de aanvraag
        </Button>
        <Text style={muted}>
          Deze melding is automatisch verstuurd zodra de aanvraag aan uw bedrijf is toegewezen.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Nieuwe aanvraag${data['categories'] ? `: ${data['categories']}` : ''}${data['city'] ? ` in ${data['city']}` : ''}`,
  displayName: 'Nieuwe lead (installateur)',
  previewData: {
    companyName: 'Zon & Duurzaam BV',
    categories: 'Zonnepanelen, Thuisbatterij',
    city: 'Zwolle',
    postcode: '8011 AB',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = { color: '#1e293b', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' }
const button = {
  backgroundColor: '#1e293b',
  color: '#ffffff',
  borderRadius: '6px',
  fontSize: '15px',
  padding: '12px 20px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '4px 0 18px',
}
const muted = { color: '#64748b', fontSize: '13px', lineHeight: '1.5', margin: '0' }
