import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleManagementTurn } from './management-handler';
import type { LLMClient } from '../llm/client';
import type { ThyraClient } from '../thyra-client/client';

describe('handleManagementTurn', () => {
  const mockParseIntent = vi.fn();
  const mockGenerateReply = vi.fn();

  const mockLlm = {
    generateStructured: mockParseIntent,
    generateText: mockGenerateReply,
  } as unknown as LLMClient;

  const mockThyra = {
    getVillage: vi.fn(),
    getActiveConstitution: vi.fn(),
    getChiefs: vi.fn(),
  } as unknown as ThyraClient;

  beforeEach(() => {
    mockParseIntent.mockReset();
    mockGenerateReply.mockReset();
    (mockThyra.getVillage as ReturnType<typeof vi.fn>).mockReset();
    (mockThyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockReset();
    (mockThyra.getChiefs as ReturnType<typeof vi.fn>).mockReset();
  });

  function setupThyraMocks() {
    (mockThyra.getVillage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'v1',
      name: 'Test Village',
      target_repo: 'org/repo',
    });
    (mockThyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1',
      village_id: 'v1',
      rules: [
        { description: 'no spam', enforcement: 'hard', scope: ['*'] },
        { description: 'be nice', enforcement: 'soft', scope: ['*'] },
      ],
    });
    (mockThyra.getChiefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ch1', village_id: 'v1', name: 'Chief Alpha' },
    ]);
  }

  it('query_status intent returns action: query', async () => {
    setupThyraMocks();
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'query_status', summary: '目前狀態' },
    });
    mockGenerateReply.mockResolvedValueOnce('Village 運作正常');

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '目前狀態怎樣？');

    expect(result.action).toBe('query');
    expect(result.reply).toBe('Village 運作正常');
    expect(result.strategy).toBe('probe');
  });

  it('query_history intent returns action: query', async () => {
    setupThyraMocks();
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'query_history', summary: '查看歷史' },
    });
    mockGenerateReply.mockResolvedValueOnce('最近一次修改...');

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '最近改了什麼？');

    expect(result.action).toBe('query');
    expect(result.reply).toBe('最近一次修改...');
  });

  it('non-query intent returns action: none', async () => {
    setupThyraMocks();
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'question', summary: '你好' },
    });
    mockGenerateReply.mockResolvedValueOnce('你好！');

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '你好');

    expect(result.action).toBe('none');
  });

  it('respects max 2 LLM calls per turn (COND-02)', async () => {
    setupThyraMocks();
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'query_status', summary: '狀態' },
    });
    mockGenerateReply.mockResolvedValueOnce('OK');

    await handleManagementTurn(mockLlm, mockThyra, 'v1', '目前狀態');

    expect(mockParseIntent).toHaveBeenCalledTimes(1);
    expect(mockGenerateReply).toHaveBeenCalledTimes(1);
  });

  it('returns fallback when parseIntent throws (LLM-02)', async () => {
    setupThyraMocks();
    mockParseIntent.mockRejectedValueOnce(new Error('LLM network error'));
    mockGenerateReply.mockResolvedValueOnce('抱歉，請再說一次');

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '你好');

    expect(result.intent.type).toBe('off_topic');
    expect(result.intent.summary).toBe('你好');
    expect(result.reply).toBe('抱歉，請再說一次');
    expect(result.action).toBe('none');
  });

  it('returns fallback reply when generateReply throws (LLM-02)', async () => {
    setupThyraMocks();
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'query_status', summary: '狀態' },
    });
    mockGenerateReply.mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '目前狀態');

    expect(result.intent.type).toBe('query_status');
    expect(result.reply).toContain('System error');
    expect(result.action).toBe('query');
  });

  it('handles Thyra failure gracefully', async () => {
    (mockThyra.getVillage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));
    (mockThyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));
    (mockThyra.getChiefs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'query_status', summary: '狀態' },
    });
    mockGenerateReply.mockResolvedValueOnce('抱歉無法連線');

    const result = await handleManagementTurn(mockLlm, mockThyra, 'v1', '目前狀態');

    expect(result.reply).toBe('抱歉無法連線');
    expect(result.action).toBe('query');
  });
});
