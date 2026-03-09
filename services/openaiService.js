/**
 * OpenAI Service for Game Summary Generation
 * Uses api2d for OpenAI API access
 * Two-step process: 1) Analyze data → JSON, 2) Generate summary from JSON
 */

const axios = require('axios');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = process.env.OPENAI_BASE_URL || 'https://openai.api2d.net/v1';
    this.model = process.env.GPT_MODEL || 'gpt-3.5-turbo';
    this.maxTokens = parseInt(process.env.GPT_MAX_TOKENS || '500');
    this.temperature = parseFloat(process.env.GPT_TEMPERATURE || '0.7');
  }

  /**
   * Step 1: Analyze game data and return structured JSON
   * @param {Object} gameFacts - Structured game facts
   * @returns {Promise<Object>} Analysis JSON
   */
  async analyzeGameData(gameFacts) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(gameFacts);

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一个比赛数据分析引擎，而不是解说员。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more deterministic analysis
          max_tokens: 800,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      const analysis = JSON.parse(content);
      return analysis;
    } catch (error) {
      console.error('OpenAI analysis error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Step 2: Generate summary text from analysis JSON
   * @param {Object} analysis - Analysis JSON from step 1
   * @returns {Promise<string>} Generated summary text
   */
  async generateSummaryFromAnalysis(analysis) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildSummaryPrompt(analysis);

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一名数据型比赛解说员。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const summary = response.data?.choices?.[0]?.message?.content?.trim();
      if (!summary) {
        throw new Error('Empty response from OpenAI');
      }

      return summary;
    } catch (error) {
      console.error('OpenAI summary error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate game summary using two-step process
   * @param {Object} gameFacts - Structured game facts
   * @returns {Promise<string>} Generated summary text
   */
  async generateGameSummary(gameFacts) {
    try {
      // Step 1: Analyze data and get JSON
      const analysis = await this.analyzeGameData(gameFacts);
      
      // Step 2: Generate summary from analysis
      const summary = await this.generateSummaryFromAnalysis(analysis);
      
      return summary;
    } catch (error) {
      console.error('Two-step AI summary generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Build Step 1 prompt: Data analysis
   * @param {Object} gameFacts - Structured game facts
   * @returns {string} Formatted prompt
   */
  buildAnalysisPrompt(gameFacts) {
    const {
      home_team,
      away_team,
      home_score,
      away_score,
      home_half,
      away_half,
      q1,
      q2,
      q3,
      q4,
      fg_home_made,
      fg_home_attempted,
      fg_home_percent,
      fg_away_made,
      fg_away_attempted,
      fg_away_percent,
      three_home_made,
      three_home_attempted,
      three_home_percent,
      three_away_made,
      three_away_attempted,
      three_away_percent,
      ft_home_made,
      ft_home_attempted,
      ft_home_percent,
      ft_away_made,
      ft_away_attempted,
      ft_away_percent,
      to_home,
      to_away,
      reb_home,
      reb_home_offensive,
      reb_home_defensive,
      reb_away,
      reb_away_offensive,
      reb_away_defensive,
      has_overtime,
      overtime_periods,
      largest_lead_home,
      largest_lead_away,
      foul_home,
      foul_away,
      points_in_paint_home,
      points_in_paint_away,
      fast_break_points_home,
      fast_break_points_away,
      turnover_points_home,
      turnover_points_away,
      halftime_leader,
      winner,
      top_scorer_home,
      top_scorer_away,
      top_points_home,
      top_points_away,
    } = gameFacts;

    // Build overtime section if applicable
    let overtimeSection = '';
    if (has_overtime && overtime_periods && overtime_periods.length > 0) {
      const otScores = overtime_periods.map(ot => `OT${ot.period}: ${ot.score}`).join('\n  ');
      overtimeSection = `- 加时赛比分：\n  ${otScores}\n`;
    }

    return `请根据以下比赛数据，进行严格的数据对比分析，并以 JSON 格式输出结果。

【分析规则】
1. 只能使用给定数据，禁止推断或补充
2. 标记主队是否在以下方面占优：
   - 篮板
   - 失误（更少为占优）
   - 投篮命中率
   - 三分命中数
3. 判断比赛走势：
   - 上半场领先方
   - 下半场净胜方
   - 是否进入加时
4. 判断是否存在"明确胜因"：
   - 若仅有 1 项轻微优势，标记为"胜负接近"
5. 不使用任何主观或修饰性语言

【输出 JSON 结构】
{
  "home": "GSW",
  "away": "LAL",
  "winner": "home/away",
  "halftime_leader": "home/away/tie",
  "overtime": true/false,
  "advantages": {
    "rebounds": "home/away/none",
    "rebounds_home": number,
    "rebounds_away": number,
    "turnovers": "home/away/none",
    "turnovers_home": number,
    "turnovers_away": number,
    "fg_home_made": number,
    "fg_away_made": number,
    "fg_home_attempted": number,
    "fg_away_attempted": number,
    "fg_home_percentage": number,
    "fg_away_percentage": number,
    "three_pt_home_made": number,
    "three_pt_away_made": number,
    "three_pt_home_attempted": number,
    "three_pt_away_attempted": number,
    "three_pt_home_percentage": number,
    "three_pt_away_percentage": number,
    "ft_home_made": number,
    "ft_away_made": number,
    "ft_home_attempted": number,
    "ft_away_attempted": number,
    "ft_home_percentage": number,
    "ft_away_percentage": number,
    "points_in_paint_home": number,
    "points_in_paint_away": number,
    "fast_break_points_home": number,
    "fast_break_points_away": number,
    "turnover_points_home": number,
    "turnover_points_away": number,
    "largest_lead_home": number,
    "largest_lead_away": number,
    "foul_home": number,
    "foul_away": number,
    "decisive_factors": [decisive_factor1, decisive_factor2, ...],
    "close_game": true/false
  },
  "decisive_factors": [decisive_factor1, decisive_factor2, ...],
  "close_game": true/false
}

比赛数据：
- 主队：${home_team}
- 客队：${away_team}
- 最终比分：${home_score} - ${away_score}
- 半场比分：${home_half} - ${away_half}
- 每节比分：
  Q1: ${q1}
  Q2: ${q2}
  Q3: ${q3}
  Q4: ${q4}
${overtimeSection}
- 投篮命中数（主）：${fg_home_made} 投篮出手数：${fg_home_attempted}
- 投篮命中率（主）：${fg_home_percent}%
- 投篮命中数（客）：${fg_away_made} 投篮出手数：${fg_away_attempted}
- 投篮命中率（客）：${fg_away_percent}%
- 三分命中数（主）：${three_home_made} 三分出手数：${three_home_attempted}
- 三分命中率（主）：${three_home_percent}%
- 三分命中数（客）：${three_away_made} 三分出手数：${three_away_attempted}
- 三分命中率（客）：${three_away_percent}%
- 罚球命中数（主）：${ft_home_made} 罚球出手数：${ft_home_attempted}
- 罚球命中率（主）：${ft_home_percent}%
- 罚球命中数（客）：${ft_away_made} 罚球出手数：${ft_away_attempted}
- 罚球命中率（客）：${ft_away_percent}%
- 失误（主/客）：${to_home} / ${to_away}
- 篮板（主/客）：${reb_home} / ${reb_away}
- 篮板（主/客）：${reb_home_offensive} / ${reb_away_offensive}
- 篮板（主/客）：${reb_home_defensive} / ${reb_away_defensive}
- 最大领先（主/客）：${largest_lead_home} / ${largest_lead_away}
- 犯规（主/客）：${foul_home} / ${foul_away}
- 内线得分（主/客）：${points_in_paint_home} / ${points_in_paint_away}
- 快攻得分（主/客）：${fast_break_points_home} / ${fast_break_points_away}
- 失误得分（主/客）：${turnover_points_home} / ${turnover_points_away}
  `;}

  /**
   * Translate NBA news article to Simplified Chinese
   * @param {Object} params - { title, content }
   * @returns {Promise<{ translated_title: string, translated_content: string }>}
   */
  async translateNewsArticle({ title = '', content }) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    if (!content || typeof content !== 'string') {
      throw new Error('Content is required for translation');
    }

    const userPrompt = title
      ? `Translate the following NBA news to Simplified Chinese. Keep it professional, accurate, and fluent.\n\nTitle: ${title}\n\nContent:\n${content}\n\nRespond with JSON only: { "translated_title": "...", "translated_content": "..." }`
      : `Translate the following NBA news to Simplified Chinese. Keep it professional, accurate, and fluent.\n\nContent:\n${content}\n\nRespond with JSON only: { "translated_title": "...", "translated_content": "..." }. Use the first sentence or a short summary as translated_title if no title is given.`;

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的体育新闻翻译。将英文NBA新闻翻译成简体中文，保持专业、准确、流畅。只输出JSON，不要其他文字。'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const contentStr = response.data?.choices?.[0]?.message?.content?.trim();
      if (!contentStr) {
        throw new Error('Empty response from OpenAI');
      }

      const result = JSON.parse(contentStr);
      return {
        translated_title: result.translated_title || result.translatedTitle || '',
        translated_content: result.translated_content || result.translatedContent || content
      };
    } catch (error) {
      console.error('OpenAI translation error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate Swish Insight for a top performer (Chinese, data-driven)
   * @param {Object} payload - { playerName, gameStats, seasonStats }
   * @returns {Promise<string>} 1-2 sentence insight in Chinese
   */
  async generateSwishInsight(payload) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { playerName, gameStats = {}, seasonStats = {} } = payload;
    const seasonData = seasonStats?.stats || seasonStats || {};
    const gamePts = parseInt(gameStats.points) || 0;
    const gameReb = parseInt(gameStats.rebounds) || 0;
    const gameAst = parseInt(gameStats.assists) || 0;
    const gameStl = parseInt(gameStats.steals) || 0;
    const gameBlk = parseInt(gameStats.blocks) || 0;
    const gameTov = parseInt(gameStats.turnovers) || 0;

    const fg = (gameStats.fieldGoals || '0-0').split('-');
    const three = (gameStats.threePointers || '0-0').split('-');
    const ft = (gameStats.freeThrows || '0-0').split('-');
    const fgm = parseInt(fg[0]) || 0;
    const fga = parseInt(fg[1]) || 0;
    const threePM = parseInt(three[0]) || 0;
    const threePA = parseInt(three[1]) || 0;
    const ftm = parseInt(ft[0]) || 0;
    const fta = parseInt(ft[1]) || 0;

    const fgPct = fga > 0 ? Math.round((fgm / fga) * 100) : 0;
    const threePct = threePA > 0 ? Math.round((threePM / threePA) * 100) : 0;
    const ftPct = fta > 0 ? Math.round((ftm / fta) * 100) : 0;

    const seasonPts = parseFloat(seasonData.avgPoints || seasonData.points || 0) || 0;
    const seasonFg = parseFloat(seasonData.fieldGoalPct || seasonData.fieldGoalPercentage || 0) || 0;
    const seasonThree = parseFloat(seasonData.threePointFieldGoalPct || seasonData.threePointFieldGoalPercentage || 0) || 0;
    const seasonFt = parseFloat(seasonData.freeThrowPct || seasonData.freeThrowPercentage || 0) || 0;
    const seasonReb = parseFloat(seasonData.avgRebounds || seasonData.rebounds || 0) || 0;
    const seasonAst = parseFloat(seasonData.avgAssists || seasonData.assists || 0) || 0;
    const seasonStl = parseFloat(seasonData.avgSteals || seasonData.steals || 0) || 0;
    const seasonBlk = parseFloat(seasonData.avgBlocks || seasonData.blocks || 0) || 0;
    const seasonTov = parseFloat(seasonData.avgTurnovers || seasonData.turnovers || 0) || 0;

    const userPrompt = `球员：${playerName}

本场数据：${gamePts}分 ${gameReb}篮板 ${gameAst}助攻 ${gameStl}抢断 ${gameBlk}盖帽 ${gameTov}失误，投篮${fgm}/${fga}（${fgPct}%），三分${threePM}/${threePA}（${threePct}%），罚球${ftm}/${fta}（${ftPct}%）

赛季场均：${seasonPts}分 ${seasonReb}篮板 ${seasonAst}助攻 ${seasonStl}抢断 ${seasonBlk}盖帽 ${seasonTov}失误，投篮${seasonFg}%，三分${seasonThree}%，罚球${seasonFt}%

这是球员${playerName}的本场数据和赛季场均数据，请生成一句非常简短的数据洞察（最多20个汉字）。要求：
- 突出球员对比赛的影响力
- 球员对比赛的影响力包括进攻以及防守两个方面
- 进攻球员需要在命中率以及得分上有显著的表现
- 防守球员需要在抢断、篮板、盖帽以上有显著的表现
- 如果球员有三双表现需要特别强调
- 必须包含具体数字，不要解释背景
- 按照你的理解，突出影响比赛的具体数据以及表现
- 像体育解说的短评
- 只输出一句话`;

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一个NBA数据分析师。根据本场数据和赛季场均数据，生成一句简短的数据洞察，用中文。不要空洞赞美，要有具体对比。只输出洞察文字，不要引号或前缀。'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.5,
          max_tokens: 40
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const insight = response.data?.choices?.[0]?.message?.content?.trim();
      if (!insight) {
        throw new Error('Empty response from OpenAI');
      }
      return insight;
    } catch (error) {
      console.error('OpenAI Swish Insight error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Build Step 2 prompt: Generate summary from analysis
   * @param {Object} analysis - Analysis JSON from step 1
   * @returns {string} Formatted prompt
   */
  buildSummaryPrompt(analysis) {
    const analysisJson = JSON.stringify(analysis, null, 2);

    return `请严格根据以下分析结果，用中文总结比赛。

【写作规则】
1. 只能使用提供的分析结论，禁止自行推断
2. 若 close_game 为 true，尽量分析比赛成败关键因素，如果无法分析则不用描述
3. 只能将 decisive_factors 中的数据作为胜因
4. 若有加时赛，只能描述加时比分差异，若没有则不用描述加时赛
5. 禁止使用情绪化或主观词语
6. 如果不能准确翻译球队名称，请使用球队英文名或简称。
7. 字数 60–120 字
8. 语言可以轻松，口语化，不要过于正式

【分析结果】
${analysisJson}`;
  }
}

module.exports = new OpenAIService();
