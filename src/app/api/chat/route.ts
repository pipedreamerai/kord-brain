import { createAgentUIStreamResponse } from 'ai';
import { qaAgent } from '@/lib/agents/qa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();
  return createAgentUIStreamResponse({
    agent: qaAgent,
    uiMessages: messages,
  });
}
