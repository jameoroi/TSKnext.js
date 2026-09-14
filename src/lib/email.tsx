import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';
import { Resend } from 'resend';

export function resendClient() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

export function OrderEmail({ orderNo, total }: { orderNo: string; total: string }) {
  return (
    <Html lang="th">
      <Head />
      <Preview>คำสั่งซื้อ {orderNo}</Preview>
      <Body style={{ fontFamily: 'Arial, sans-serif', background: '#f6f7f8' }}>
        <Container style={{ maxWidth: 560, background: '#fff', margin: '32px auto', padding: 32 }}>
          <Heading>THAISERKIT SUPPLY</Heading>
          <Section>
            <Text>เราได้รับคำสั่งซื้อ {orderNo} แล้ว</Text>
            <Text>ยอดรวม {total}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
