// Skill vocabulary for COLLIVRA matching: normalisation, aliases and known relationships.
// Pure TypeScript (no Deno, no network) so it is unit-tested with plain Node.
//
// Two different things are kept strictly apart:
//   * EQUIVALENT  - the same skill written differently (ML = Machine Learning). Strength 1.0.
//   * RELATED     - a different skill that supports the requirement (TensorFlow for Machine
//                   Learning). Strength 0.75 (strongly related) or 0.4 (partial).
// Nothing is ever matched by substring or shared words ("Java" must never match "JavaScript").

export function canon(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "Python (Advanced)" -> "python"
    .replace(/\.net\b/g, 'dotnet')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#]+/g, '') // drops spaces, dots, dashes, slashes
    .trim()
}

// canonical label first, then its aliases. Every entry means "the same skill".
const ALIAS_GROUPS: string[][] = [
  ['Machine Learning', 'ML', 'Machine-Learning', 'Applied Machine Learning'],
  ['Deep Learning', 'DL'],
  ['Natural Language Processing', 'NLP', 'Natural Language Understanding', 'NLU'],
  ['Artificial Intelligence', 'AI', 'A.I.'],
  ['Computer Vision', 'CV', 'Machine Vision'],
  ['Large Language Models', 'LLM', 'LLMs', 'Large Language Model'],
  ['Generative AI', 'GenAI', 'Gen AI', 'Generative Artificial Intelligence'],
  ['Data Science', 'Data Scientist'],
  ['Data Analysis', 'Data Analytics', 'Data Analyst'],
  ['Data Visualization', 'Data Visualisation', 'Data Viz'],
  ['Data Engineering', 'ETL', 'Data Pipelines'],
  ['JavaScript', 'JS', 'ECMAScript', 'ES6', 'Vanilla JS', 'Vanilla JavaScript'],
  ['TypeScript', 'TS'],
  ['Python', 'Python3', 'Python 3', 'Py'],
  ['Java', 'Core Java', 'Java SE'],
  ['C++', 'CPP', 'C Plus Plus'],
  ['C#', 'C Sharp', 'CSharp'],
  ['Go', 'Golang', 'Go Lang'],
  ['Rust', 'Rust Lang'],
  ['R', 'R Programming', 'R Language', 'RLang'],
  ['SQL', 'Structured Query Language'],
  ['PostgreSQL', 'Postgres', 'Postgre SQL', 'PSQL'],
  ['MySQL', 'My SQL'],
  ['MongoDB', 'Mongo', 'Mongo DB'],
  ['SQLite', 'SQLite3'],
  ['Redis'],
  ['React', 'React.js', 'ReactJS', 'React JS'],
  ['Next.js', 'NextJS', 'Next JS', 'Next'],
  ['Vue.js', 'Vue', 'VueJS', 'Vue JS'],
  ['Angular', 'AngularJS', 'Angular.js', 'Angular 2+'],
  ['Svelte', 'SvelteKit'],
  ['Node.js', 'Node', 'NodeJS', 'Node JS'],
  ['Express.js', 'Express', 'ExpressJS', 'Express JS'],
  ['Django', 'Django Framework'],
  ['Flask', 'Flask Framework'],
  ['FastAPI', 'Fast API'],
  ['Spring Boot', 'SpringBoot', 'Spring', 'Spring Framework'],
  ['HTML', 'HTML5', 'HTML 5'],
  ['CSS', 'CSS3', 'CSS 3'],
  ['Tailwind CSS', 'Tailwind', 'TailwindCSS'],
  ['REST API', 'REST', 'RESTful API', 'RESTful APIs', 'REST APIs', 'RESTful', 'REST API Development', 'RESTful API Development'],
  ['GraphQL', 'Graph QL'],
  ['Docker', 'Docker Containers', 'Containerization'],
  ['Kubernetes', 'K8s', 'K8'],
  ['CI/CD', 'CICD', 'Continuous Integration', 'Continuous Delivery', 'CI CD'],
  ['DevOps', 'Dev Ops'],
  ['Git', 'GitHub', 'Git/GitHub', 'Version Control'],
  ['Linux', 'Unix', 'Linux/Unix'],
  ['AWS', 'Amazon Web Services'],
  ['Azure', 'Microsoft Azure'],
  ['GCP', 'Google Cloud', 'Google Cloud Platform'],
  ['Cloud Computing', 'Cloud'],
  ['Firebase', 'Google Firebase'],
  ['Supabase'],
  ['TensorFlow', 'TF', 'Tensor Flow'],
  ['PyTorch', 'Torch', 'Py Torch'],
  ['Keras'],
  ['Scikit-learn', 'sklearn', 'scikit learn', 'sci-kit learn'],
  ['Pandas'],
  ['NumPy', 'Numpy'],
  ['OpenCV', 'Open CV'],
  ['Hugging Face', 'HuggingFace', 'Transformers'],
  ['Neural Networks', 'Neural Network', 'ANN', 'Artificial Neural Networks'],
  ['Convolutional Neural Networks', 'CNN', 'CNNs'],
  ['Prompt Engineering', 'Prompting'],
  ['Frontend Development', 'Front End Development', 'Front-End Development', 'Frontend', 'Front End', 'Front-End', 'Frontend Developer'],
  ['Backend Development', 'Back End Development', 'Back-End Development', 'Backend', 'Back End', 'Back-End', 'Backend Developer'],
  ['Full Stack Development', 'Full-Stack Development', 'Fullstack', 'Full Stack', 'Full-Stack', 'Full Stack Developer'],
  ['Mobile App Development', 'Mobile Development', 'Mobile Apps', 'App Development'],
  ['Android Development', 'Android', 'Android Studio'],
  ['iOS Development', 'iOS', 'iOS App Development'],
  ['React Native', 'ReactNative'],
  ['Flutter', 'Flutter Framework'],
  ['Dart'],
  ['Kotlin'],
  ['Swift', 'SwiftUI'],
  ['UI/UX Design', 'UI UX', 'UX/UI', 'UI/UX', 'UI and UX Design', 'User Experience Design', 'Product Design'],
  ['UI Design', 'User Interface Design'],
  ['UX Design', 'UX', 'User Experience', 'UX Research'],
  ['Figma'],
  ['Adobe XD', 'XD'],
  ['Cybersecurity', 'Cyber Security', 'Information Security', 'InfoSec'],
  ['Network Security'],
  ['Penetration Testing', 'Pen Testing', 'Pentesting', 'Ethical Hacking'],
  ['Blockchain', 'Distributed Ledger'],
  ['Solidity', 'Smart Contracts'],
  ['Web3', 'Web 3'],
  ['Internet of Things', 'IoT'],
  ['Embedded Systems', 'Embedded'],
  ['Arduino'],
  ['Raspberry Pi', 'RaspberryPi'],
  ['Power BI', 'PowerBI'],
  ['Tableau'],
  ['Excel', 'Microsoft Excel', 'MS Excel'],
  ['Statistics', 'Statistical Analysis', 'Stats'],
  ['MATLAB'],
  ['Spark', 'Apache Spark', 'PySpark'],
  ['Hadoop', 'Apache Hadoop'],
  ['Big Data'],
  ['Software Testing', 'QA', 'Quality Assurance', 'Test Automation'],
  ['Agile', 'Scrum', 'Agile/Scrum'],
  ['Project Management', 'PM'],
  ['Technical Writing', 'Documentation'],
  ['Microservices', 'Micro Services'],
  ['WebSockets', 'Web Sockets', 'Socket.io', 'Socket IO'],
  ['PHP'],
  ['Laravel'],
  ['Ruby on Rails', 'Rails', 'RoR', 'Ruby'],
  ['.NET', 'dotnet', 'ASP.NET', 'Dot Net'],
  ['MERN Stack', 'MERN'],
  ['Unity', 'Unity3D', 'Unity 3D'],
  ['Game Development', 'Game Dev'],
  ['Robotics', 'ROS'],
  ['Time Series Analysis', 'Time Series', 'Time-Series Forecasting', 'Forecasting'],
  ['Recommendation Systems', 'Recommender Systems', 'Recommendation Engines'],
  ['Reinforcement Learning', 'RL'],
  ['Speech Recognition', 'ASR', 'Speech to Text'],
  ['Image Processing', 'Image Analysis'],
]

const ALIAS_TO_ID = new Map<string, string>()
const KNOWN = new Set<string>()
for (const group of ALIAS_GROUPS) {
  const id = canon(group[0])
  for (const name of group) ALIAS_TO_ID.set(canon(name), id)
  KNOWN.add(id)
}

// Resolve any spelling to its canonical id (or just its normalised form if unknown).
export function skillId(raw: unknown): string {
  const k = canon(raw)
  return ALIAS_TO_ID.get(k) ?? k
}

// "required skill" -> [[skill a student might list, strength]]. Direction matters: it answers
// "how much does having X help with this requirement?". 0.75 = strongly related, 0.4 = partial.
// An entry here is a claim that the relationship is genuine; it never makes the skills identical.
const S = 0.75
const P = 0.4
type Rel = [string, number]
const RELATION_DEFS: Record<string, Rel[]> = {
  'Machine Learning': [['Deep Learning', S], ['Scikit-learn', P], ['TensorFlow', P], ['PyTorch', P], ['Keras', P], ['Neural Networks', P], ['Data Science', S], ['Reinforcement Learning', S], ['Artificial Intelligence', P], ['Recommendation Systems', P]],
  'Deep Learning': [['Neural Networks', S], ['Convolutional Neural Networks', S], ['TensorFlow', P], ['PyTorch', P], ['Keras', P], ['Machine Learning', P], ['Computer Vision', P], ['Natural Language Processing', P]],
  'Neural Networks': [['Deep Learning', S], ['Convolutional Neural Networks', S], ['TensorFlow', P], ['PyTorch', P], ['Keras', P], ['Machine Learning', P]],
  'Natural Language Processing': [['Hugging Face', P], ['Large Language Models', S], ['Speech Recognition', P], ['Generative AI', P], ['Prompt Engineering', P], ['Deep Learning', P], ['Machine Learning', P]],
  'Large Language Models': [['Generative AI', S], ['Prompt Engineering', S], ['Natural Language Processing', S], ['Hugging Face', P]],
  'Generative AI': [['Large Language Models', S], ['Prompt Engineering', S], ['Deep Learning', P], ['Machine Learning', P]],
  'Artificial Intelligence': [['Machine Learning', S], ['Deep Learning', S], ['Natural Language Processing', S], ['Computer Vision', S], ['Large Language Models', S], ['Generative AI', S], ['Reinforcement Learning', S], ['Neural Networks', S], ['Robotics', P], ['Data Science', P]],
  'Computer Vision': [['OpenCV', S], ['Image Processing', S], ['Convolutional Neural Networks', S], ['Deep Learning', P], ['TensorFlow', P], ['PyTorch', P]],
  'Data Science': [['Machine Learning', S], ['Data Analysis', S], ['Statistics', P], ['Pandas', P], ['NumPy', P], ['Python', P], ['R', P], ['Big Data', P]],
  'Data Analysis': [['Data Science', S], ['Pandas', P], ['Excel', P], ['SQL', P], ['Power BI', P], ['Tableau', P], ['Statistics', P], ['Data Visualization', S]],
  'Data Visualization': [['Tableau', S], ['Power BI', S], ['Data Analysis', P], ['Excel', P]],
  'Data Engineering': [['Spark', S], ['Hadoop', P], ['SQL', P], ['Big Data', S], ['Python', P]],
  'Big Data': [['Spark', S], ['Hadoop', S], ['Data Engineering', S]],
  'JavaScript': [['TypeScript', S], ['Node.js', P], ['React', P], ['Vue.js', P], ['Angular', P], ['Next.js', P], ['Svelte', P]],
  'TypeScript': [['JavaScript', P]],
  'React': [['Next.js', S], ['React Native', P], ['JavaScript', P], ['TypeScript', P]],
  'Next.js': [['React', S]],
  'Vue.js': [['JavaScript', P]],
  'Angular': [['TypeScript', P], ['JavaScript', P]],
  'Node.js': [['JavaScript', P], ['Express.js', S], ['TypeScript', P]],
  'Express.js': [['Node.js', S]],
  'Python': [['Django', P], ['Flask', P], ['FastAPI', P], ['Pandas', P], ['NumPy', P]],
  'Django': [['Python', P], ['Flask', P]],
  'Flask': [['Python', P], ['Django', P], ['FastAPI', P]],
  'FastAPI': [['Python', P], ['Flask', P]],
  'Java': [['Spring Boot', P], ['Kotlin', P]],
  'Spring Boot': [['Java', P]],
  'Frontend Development': [['React', P], ['Vue.js', P], ['Angular', P], ['Next.js', P], ['Svelte', P], ['HTML', P], ['CSS', P], ['JavaScript', P], ['TypeScript', P], ['Tailwind CSS', P], ['UI Design', P]],
  'Backend Development': [['Node.js', P], ['Express.js', P], ['Django', P], ['Flask', P], ['FastAPI', P], ['Spring Boot', P], ['PHP', P], ['Laravel', P], ['Ruby on Rails', P], ['.NET', P], ['REST API', S], ['Microservices', P], ['Full Stack Development', S]],
  'Full Stack Development': [['Frontend Development', P], ['Backend Development', P], ['MERN Stack', S], ['React', P], ['Node.js', P], ['Next.js', P]],
  'MERN Stack': [['Full Stack Development', S], ['React', P], ['Node.js', P], ['MongoDB', P], ['Express.js', P]],
  'REST API': [['Express.js', P], ['FastAPI', P], ['Flask', P], ['Django', P], ['Node.js', P], ['Spring Boot', P], ['Backend Development', P], ['GraphQL', P], ['Microservices', P]],
  'GraphQL': [['REST API', P]],
  'SQL': [['PostgreSQL', S], ['MySQL', S], ['SQLite', S]],
  'PostgreSQL': [['SQL', P], ['MySQL', P], ['Supabase', P]],
  'MySQL': [['SQL', P], ['PostgreSQL', P]],
  'MongoDB': [['MERN Stack', P]],
  'Supabase': [['PostgreSQL', P], ['Firebase', P]],
  'Firebase': [['Supabase', P]],
  'Docker': [['Kubernetes', P], ['DevOps', P]],
  'Kubernetes': [['Docker', P], ['DevOps', P]],
  'DevOps': [['Docker', P], ['Kubernetes', P], ['CI/CD', S], ['Linux', P], ['AWS', P], ['Azure', P], ['GCP', P]],
  'CI/CD': [['DevOps', S]],
  'Cloud Computing': [['AWS', S], ['Azure', S], ['GCP', S], ['DevOps', P], ['Docker', P], ['Kubernetes', P]],
  'AWS': [['Cloud Computing', P]],
  'Azure': [['Cloud Computing', P]],
  'GCP': [['Cloud Computing', P]],
  'Mobile App Development': [['Flutter', S], ['React Native', S], ['Android Development', S], ['iOS Development', S], ['Kotlin', P], ['Swift', P], ['Dart', P]],
  'Android Development': [['Kotlin', P], ['Java', P], ['Mobile App Development', S], ['Flutter', P], ['React Native', P]],
  'iOS Development': [['Swift', P], ['Mobile App Development', S], ['Flutter', P], ['React Native', P]],
  'React Native': [['React', P], ['Mobile App Development', P], ['JavaScript', P]],
  'Flutter': [['Dart', P], ['Mobile App Development', P]],
  'UI/UX Design': [['UI Design', S], ['UX Design', S], ['Figma', S], ['Adobe XD', S]],
  'UI Design': [['UI/UX Design', S], ['Figma', P], ['Adobe XD', P], ['UX Design', P]],
  'UX Design': [['UI/UX Design', S], ['UI Design', P], ['Figma', P]],
  'Figma': [['UI/UX Design', P], ['UI Design', P], ['Adobe XD', P]],
  'Cybersecurity': [['Network Security', S], ['Penetration Testing', S], ['Linux', P]],
  'Network Security': [['Cybersecurity', S], ['Penetration Testing', P]],
  'Penetration Testing': [['Cybersecurity', S], ['Network Security', P]],
  'Blockchain': [['Solidity', S], ['Web3', S]],
  'Web3': [['Blockchain', S], ['Solidity', S]],
  'Solidity': [['Blockchain', P], ['Web3', P]],
  'Internet of Things': [['Arduino', P], ['Raspberry Pi', P], ['Embedded Systems', S]],
  'Embedded Systems': [['Arduino', P], ['Raspberry Pi', P], ['Internet of Things', S], ['C++', P]],
  'Robotics': [['Embedded Systems', P], ['Arduino', P], ['Raspberry Pi', P], ['Computer Vision', P]],
  'Statistics': [['Data Analysis', P], ['Data Science', P], ['R', P], ['MATLAB', P]],
  'Software Testing': [['Agile', P]],
  'Time Series Analysis': [['Statistics', P], ['Machine Learning', P], ['Data Science', P]],
  'Recommendation Systems': [['Machine Learning', P], ['Data Science', P]],
  'Reinforcement Learning': [['Machine Learning', P], ['Deep Learning', P]],
  'Game Development': [['Unity', S]],
  'Unity': [['Game Development', P]],
}

const RELATIONS = new Map<string, Map<string, number>>()
for (const [required, list] of Object.entries(RELATION_DEFS)) {
  const key = skillId(required)
  const inner = RELATIONS.get(key) ?? new Map<string, number>()
  for (const [other, strength] of list) inner.set(skillId(other), strength)
  RELATIONS.set(key, inner)
  KNOWN.add(key)
  for (const [other] of list) KNOWN.add(skillId(other))
}

export type MatchKind = 'exact' | 'strong' | 'partial'
export const STRENGTH: Record<MatchKind, number> = { exact: 1, strong: 0.75, partial: 0.4 }

export type SkillRelation = { kind: MatchKind; strength: number }

// null when the two skills are not related; never throws.
export function localRelation(requiredSkill: string, studentSkill: string): SkillRelation | null {
  const r = skillId(requiredSkill)
  const s = skillId(studentSkill)
  if (!r || !s) return null
  if (r === s) return { kind: 'exact', strength: STRENGTH.exact }
  const strength = RELATIONS.get(r)?.get(s)
  if (strength === STRENGTH.strong) return { kind: 'strong', strength }
  if (strength === STRENGTH.partial) return { kind: 'partial', strength }
  return null
}

export const isKnownSkill = (raw: unknown): boolean => KNOWN.has(skillId(raw))

// True when the taxonomy cannot settle this pair by itself, i.e. a semantic judgement may help.
// If BOTH skills are known to the taxonomy and no relation is listed, the answer is "unrelated".
export function needsSemanticJudgement(requiredSkill: string, studentSkill: string): boolean {
  if (localRelation(requiredSkill, studentSkill)) return false
  return !(isKnownSkill(requiredSkill) && isKnownSkill(studentSkill))
}

// Which skills tend to belong to which kind of role. Used only to map a project role to the
// project's REQUIRED skills when the AI did not supply a mapping (it never creates skills).
export const ROLE_FAMILIES: { keywords: string[]; skills: string[] }[] = [
  { keywords: ['frontend', 'front end', 'ui developer', 'web developer'], skills: ['Frontend Development', 'React', 'HTML', 'CSS', 'JavaScript'] },
  { keywords: ['backend', 'back end', 'api developer', 'server'], skills: ['Backend Development', 'Node.js', 'REST API', 'SQL', 'Django'] },
  { keywords: ['full stack', 'fullstack', 'full-stack'], skills: ['Full Stack Development', 'React', 'Node.js'] },
  { keywords: ['ml', 'machine learning', 'ai engineer', 'ai/ml', 'data scientist', 'ai specialist', 'research'], skills: ['Machine Learning', 'Deep Learning', 'Artificial Intelligence', 'Data Science'] },
  { keywords: ['nlp', 'language'], skills: ['Natural Language Processing', 'Large Language Models'] },
  { keywords: ['computer vision', 'vision'], skills: ['Computer Vision', 'Deep Learning'] },
  { keywords: ['data engineer', 'data analyst', 'analytics'], skills: ['Data Engineering', 'Data Analysis', 'SQL', 'Data Visualization'] },
  { keywords: ['mobile', 'android', 'ios', 'app developer'], skills: ['Mobile App Development', 'Flutter', 'React Native'] },
  { keywords: ['devops', 'cloud', 'infrastructure', 'sre'], skills: ['DevOps', 'Cloud Computing', 'Docker'] },
  { keywords: ['design', 'ux', 'ui/ux', 'ui designer'], skills: ['UI/UX Design', 'Figma'] },
  { keywords: ['security', 'cyber'], skills: ['Cybersecurity'] },
  { keywords: ['blockchain', 'web3', 'smart contract'], skills: ['Blockchain', 'Solidity'] },
  { keywords: ['iot', 'embedded', 'hardware', 'robotic'], skills: ['Internet of Things', 'Embedded Systems', 'Robotics'] },
  { keywords: ['game'], skills: ['Game Development', 'Unity'] },
]
