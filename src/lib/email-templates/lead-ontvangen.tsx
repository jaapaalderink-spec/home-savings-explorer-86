import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  categories?: string
  city?: string
}

const Email = ({ firstName, categories, city }: Props) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Uw aanvraag is ontvangen — wij zoeken een specialist in uw regio</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Uw aanvraag is ontvangen</Heading>
        <Text style={text}>{firstName ? `Beste ${firstName},` : 'Beste meneer/mevrouw,'}</Text>
        <Text style={text}>
          Bedankt voor uw aanvraag{categories ? ` voor ${categories}` : ''}
          {city ? ` in ${city}` : ''}. Wij zijn op zoek naar een geschikte installateur in uw
          regio.
        </Text>
        <Text style={text}>
          Zodra wij u hebben gekoppeld aan een of meerdere specialisten, ontvangt u van ons een
          e-mail met de bedrijfsnaam en contactgegevens. De installateur neemt daarna
          vrijblijvend contact met u op.
        </Text>
        <Text style={text}>
          Met vriendelijke groet,
          <br />
          Onafhankelijke Offerte
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Uw aanvraag is ontvangen – wij zoeken een specialist in uw regio',
  displayName: 'Aanvraag ontvangen (particulier)',
  previewData: { firstName: 'Jan', categories: 'Zonnepanelen, Thuisbatterij', city: 'Zwolle' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = { color: '#1e293b', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' }
