import React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface MatchedCompany {
  name: string
  address?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  website?: string | null
}

interface Props {
  firstName?: string
  categories?: string
  companies?: MatchedCompany[]
}

const Email = ({ firstName, categories, companies }: Props) => {
  const list = companies ?? []
  return (
    <Html lang="nl" dir="ltr">
      <Head />
      <Preview>Wij hebben een installateur voor u gevonden</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Wij hebben een installateur voor u gevonden</Heading>
          <Text style={text}>{firstName ? `Beste ${firstName},` : 'Beste meneer/mevrouw,'}</Text>
          <Text style={text}>
            Goed nieuws: wij hebben uw aanvraag{categories ? ` voor ${categories}` : ''} gekoppeld
            aan {list.length === 1 ? 'de onderstaande installateur' : 'de onderstaande installateurs'}.
            {list.length === 1 ? ' Deze neemt' : ' Zij nemen'} binnenkort vrijblijvend contact met
            u op.
          </Text>
          {list.map((c) => (
            <Container key={c.name} style={card}>
              <Text style={companyName}>{c.name}</Text>
              {c.address ? <Text style={companyLine}>{c.address}</Text> : null}
              {c.contactPhone ? <Text style={companyLine}>Telefoon: {c.contactPhone}</Text> : null}
              {c.contactEmail ? (
                <Text style={companyLine}>
                  E-mail: <Link href={`mailto:${c.contactEmail}`} style={link}>{c.contactEmail}</Link>
                </Text>
              ) : null}
              {c.website ? (
                <Text style={companyLine}>
                  Website:{' '}
                  <Link href={c.website.startsWith('http') ? c.website : `https://${c.website}`} style={link}>
                    {c.website}
                  </Link>
                </Text>
              ) : null}
            </Container>
          ))}
          <Hr style={hr} />
          <Text style={muted}>
            Heeft u vragen over uw aanvraag? Antwoord gerust op deze e-mail.
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
}

export const template = {
  component: Email,
  subject: 'Wij hebben een installateur voor u gevonden',
  displayName: 'Koppeling aan installateur (particulier)',
  previewData: {
    firstName: 'Jan',
    categories: 'Zonnepanelen',
    companies: [
      {
        name: 'Zon & Duurzaam BV',
        address: 'Dorpsstraat 12, Zwolle',
        contactEmail: 'info@zonenduurzaam.nl',
        contactPhone: '038 - 123 45 67',
        website: 'www.zonenduurzaam.nl',
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = { color: '#1e293b', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' }
const card = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 12px',
}
const companyName = { color: '#1e293b', fontSize: '16px', fontWeight: 'bold' as const, margin: '0 0 6px' }
const companyLine = { color: '#334155', fontSize: '14px', lineHeight: '1.5', margin: '0 0 4px' }
const link = { color: '#1e293b', textDecoration: 'underline' }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const muted = { color: '#64748b', fontSize: '13px', lineHeight: '1.5', margin: '0 0 14px' }
