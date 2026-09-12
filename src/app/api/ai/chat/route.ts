import { streamText } from 'ai';
import { z } from 'zod';
import { aiSdkOpenAI } from '@/lib/ai';

const schema=z.object({messages:z.array(z.object({role:z.enum(['system','user','assistant']),content:z.string().max(12000)})).min(1).max(50)});
export async function POST(request:Request){const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return Response.json({ok:false,error:'invalid_input'},{status:422});const provider=aiSdkOpenAI();if(!provider)return Response.json({ok:false,error:'ai_not_configured'},{status:503});const result=streamText({model:provider(process.env.OPENAI_MODEL||'gpt-5-mini'),messages:body.data.messages,system:'You are THAISERKIT SUPPLY commerce assistant. Answer accurately and do not invent inventory, price, order or customer data.'});return result.toTextStreamResponse()}
