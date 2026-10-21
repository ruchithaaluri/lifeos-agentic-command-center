import { prisma } from '@lifeos/database';
import { SearchContextInputSchema } from '@lifeos/shared';

export const searchContextTool = {
  name: 'search_context',
  description:
    'Use this tool to search across the user\'s tasks, events, and projects using a natural language query. Use it when you need to find relevant items that the user mentioned but you don\'t have their IDs — for example, searching for "demo" to find the product demo task and event. Returns results ranked by relevance.',
  inputSchema: {
    type: 'object' as const,
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Natural language search query (max 500 chars)' },
      types: {
        type: 'array',
        items: { type: 'string', enum: ['task', 'event', 'project'] },
        description: 'Entity types to search (default: all)',
      },
      limit: { type: 'number', description: 'Max results per type (default: 10)' },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: SearchContextInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = SearchContextInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { query, types = ['task', 'event', 'project'], limit = 10 } = parsed.data;
    const lowerQuery = query.toLowerCase();
    const results: Array<{
      type: 'task' | 'event' | 'project';
      id: string;
      title: string;
      relevance: number;
      snippet: string;
    }> = [];

    // Simple keyword relevance — production would use full-text search / embeddings
    function scoreText(text: string): number {
      const lower = text.toLowerCase();
      const words = lowerQuery.split(/\s+/).filter(Boolean);
      let score = 0;
      for (const word of words) {
        if (lower.includes(word)) score += 1;
        if (lower.startsWith(word)) score += 0.5;
      }
      return Math.min(score / words.length, 1);
    }

    if (types.includes('task')) {
      const tasks = await prisma.task.findMany({
        where: { userId, deletedAt: null },
        take: 100,
      });
      for (const t of tasks) {
        const score = scoreText(`${t.title} ${t.description ?? ''}`);
        if (score > 0) {
          results.push({
            type: 'task',
            id: t.id,
            title: t.title,
            relevance: score,
            snippet: `${t.status} · ${t.priority} priority${t.dueDate ? ` · due ${t.dueDate.toLocaleDateString()}` : ''}`,
          });
        }
      }
    }

    if (types.includes('event')) {
      const events = await prisma.calendarEvent.findMany({
        where: { userId },
        take: 100,
        orderBy: { start: 'desc' },
      });
      for (const e of events) {
        const score = scoreText(`${e.title} ${e.description ?? ''}`);
        if (score > 0) {
          results.push({
            type: 'event',
            id: e.id,
            title: e.title,
            relevance: score,
            snippet: `${e.type} · ${e.start.toLocaleString()}`,
          });
        }
      }
    }

    if (types.includes('project')) {
      const projects = await prisma.project.findMany({ where: { userId } });
      for (const p of projects) {
        const score = scoreText(`${p.name} ${p.description ?? ''}`);
        if (score > 0) {
          results.push({
            type: 'project',
            id: p.id,
            title: p.name,
            relevance: score,
            snippet: p.description?.slice(0, 100) ?? p.status,
          });
        }
      }
    }

    const sorted = results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);

    return JSON.stringify({ results: sorted, query, total: sorted.length });
  },
};
