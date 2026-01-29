/**
 * Team Name and City Translations (English to Chinese)
 * Maps team names and cities to Simplified Chinese (zh-CN)
 */

const TEAM_TRANSLATIONS = {
  // Team Name Translations (name -> nameZhCN)
  'Hawks': '老鹰',
  'Celtics': '凯尔特人',
  'Nets': '篮网',
  'Hornets': '黄蜂',
  'Bulls': '公牛',
  'Cavaliers': '骑士',
  'Mavericks': '独行侠',
  'Nuggets': '掘金',
  'Pistons': '活塞',
  'Warriors': '勇士',
  'Rockets': '火箭',
  'Pacers': '步行者',
  'Clippers': '快船',
  'Lakers': '湖人',
  'Grizzlies': '灰熊',
  'Heat': '热火',
  'Bucks': '雄鹿',
  'Timberwolves': '森林狼',
  'Pelicans': '鹈鹕',
  'Knicks': '尼克斯',
  'Thunder': '雷霆',
  'Magic': '魔术',
  '76ers': '76人',
  'Suns': '太阳',
  'Blazers': '开拓者',
  'Kings': '国王',
  'Spurs': '马刺',
  'Raptors': '猛龙',
  'Jazz': '爵士',
  'Wizards': '奇才',

  // City Translations (city -> cityZhCN)
  'Atlanta': '亚特兰大',
  'Boston': '波士顿',
  'Brooklyn': '布鲁克林',
  'Charlotte': '夏洛特',
  'Chicago': '芝加哥',
  'Cleveland': '克利夫兰',
  'Dallas': '达拉斯',
  'Denver': '丹佛',
  'Detroit': '底特律',
  'Golden State': '金州',
  'Houston': '休斯顿',
  'Indiana': '印第安纳',
  'LA': '洛杉矶',
  'Los Angeles': '洛杉矶',
  'Memphis': '孟菲斯',
  'Miami': '迈阿密',
  'Milwaukee': '密尔沃基',
  'Minnesota': '明尼苏达',
  'New Orleans': '新奥尔良',
  'New York': '纽约',
  'Oklahoma City': '俄克拉荷马城',
  'Orlando': '奥兰多',
  'Philadelphia': '费城',
  'Phoenix': '菲尼克斯',
  'Portland': '波特兰',
  'Sacramento': '萨克拉门托',
  'San Antonio': '圣安东尼奥',
  'Toronto': '多伦多',
  'Utah': '犹他',
  'Washington': '华盛顿'
};

/**
 * Get Chinese translation for team name
 * @param {string} teamName - English team name
 * @returns {string} Chinese team name, or original if not found
 */
function getTeamNameZhCn(teamName) {
  if (!teamName) return '';
  return TEAM_TRANSLATIONS[teamName] || teamName;
}

/**
 * Get Chinese translation for team city
 * @param {string} city - English city name
 * @returns {string} Chinese city name, or original if not found
 */
function getTeamCityZhCn(city) {
  if (!city) return '';
  return TEAM_TRANSLATIONS[city] || city;
}

module.exports = {
  getTeamNameZhCn,
  getTeamCityZhCn,
  TEAM_TRANSLATIONS
};
