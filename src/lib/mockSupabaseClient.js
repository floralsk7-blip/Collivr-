// Mock Supabase service layer for safe local development without live credentials.
// Preserves real Supabase behavior when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are present.
import { analyzeMentorRequirementsRuleBased } from './mentorRequirements.js'

const STORAGE_SESSION_KEY = 'collivra_dev_mock_session'

const DEFAULT_STUDENT_USER = {
  id: 'dev-user-student-001',
  email: 'student.dev@collivra.local',
  user_metadata: { account_type: 'student' },
  app_metadata: { provider: 'dev-mode' },
  role: 'authenticated',
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

const DEFAULT_ORGANISER_USER = {
  id: 'dev-user-organiser-001',
  email: 'organiser.dev@collivra.local',
  user_metadata: { account_type: 'organiser' },
  app_metadata: { provider: 'dev-mode' },
  role: 'authenticated',
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

// In-memory mock database store (persists for the session)
const mockData = {
  student_profiles: [
    {
      id: 'dev-user-student-001',
      name: 'Alex Rivera (Dev Mode)',
      photo_url: null,
      college: 'Tech Institute of Technology',
      year: 3,
      department: 'Computer Science',
      branch: 'CSE',
      skills: ['React', 'Python', 'Tailwind CSS', 'Node.js', 'FastAPI'],
      skills_detailed: [],
      experience: 'Intermediate',
      previous_projects: ['Smart Campus', 'AI Study Notes'],
      github_url: 'https://github.com/example',
      linkedin_url: 'https://linkedin.com/in/example',
      cgpa: 8.9,
      tagline: 'Full-stack builder passionate about AI and collaboration',
      location: 'Boston, MA',
      availability_hours: '15',
      project_interests: ['AI/ML', 'Web Development'],
      open_to_collaborate: true,
      account_type: 'student',
      is_mentor: false,
      mentor_topics: [],
      mentor_bio: '',
    },
    {
      id: 'dev-user-organiser-001',
      name: 'Samira Patel (Organiser)',
      photo_url: null,
      college: 'Global Hackathon League',
      year: 4,
      department: 'Software Engineering',
      branch: 'SE',
      skills: ['Event Operations', 'Community Building'],
      skills_detailed: [],
      experience: 'Advanced',
      previous_projects: ['HackSprint 2025'],
      github_url: '',
      linkedin_url: '',
      cgpa: 9.1,
      tagline: 'Hackathon Director & Tech Lead',
      location: 'San Francisco, CA',
      availability_hours: '20',
      project_interests: ['Hackathons', 'Developer Tools'],
      open_to_collaborate: false,
      account_type: 'organiser',
      is_mentor: false,
      mentor_topics: [],
      mentor_bio: '',
    },
    {
      id: 'dev-mentor-faculty-001',
      name: 'Dr. Marcus Vance',
      photo_url: null,
      college: 'Department of Computer Science & AI',
      year: null,
      department: 'Computer Science',
      branch: 'CSE',
      skills: ['Python', 'Machine Learning', 'PyTorch', 'Data Structures', 'Algorithms'],
      skills_detailed: [],
      experience: 'Advanced',
      previous_projects: ['Neural Network Optimization Research'],
      github_url: '',
      linkedin_url: '',
      cgpa: null,
      tagline: 'Professor & AI Research Advisor',
      location: 'Cambridge, MA',
      availability_hours: '10',
      project_interests: ['AI/ML', 'Research'],
      open_to_collaborate: false,
      account_type: 'student',
      is_mentor: true,
      mentor_topics: ['AI/ML', 'Research', 'Algorithms', 'Deep Learning'],
      mentor_bio: 'Faculty professor providing academic and research mentorship on machine learning and computational algorithms.',
    },
    {
      id: 'dev-mentor-industry-002',
      name: 'Elena Rostova',
      photo_url: null,
      college: 'Staff Engineer @ CloudScale',
      year: null,
      department: 'Software Engineering',
      branch: 'IT',
      skills: ['React', 'Node.js', 'System Architecture', 'PayPal REST APIs', 'Microservices'],
      skills_detailed: [],
      experience: 'Advanced',
      previous_projects: ['High-Concurrency Payment Gateway'],
      github_url: '',
      linkedin_url: '',
      cgpa: null,
      tagline: 'Staff Software Architect & Startup Advisor',
      location: 'New York, NY',
      availability_hours: '8',
      project_interests: ['FinTech', 'Cloud Architecture'],
      open_to_collaborate: false,
      account_type: 'student',
      is_mentor: true,
      mentor_topics: ['FinTech', 'Full-stack', 'System Architecture', 'Payments'],
      mentor_bio: '10+ years building high-throughput payment systems and scaling consumer applications from seed to Series C.',
    },
  ],
  projects: [
    {
      id: 'dev-project-001',
      creator_id: 'dev-user-student-001',
      name: 'EcoTrack Sustainability Intelligence',
      description: 'An AI-powered environmental monitoring platform helping campuses measure carbon footprints, detect energy wastage, and promote recycling initiatives.',
      domain: 'AI/ML',
      deadline: '2026-12-15',
      team_size: 4,
      skills_required: ['Python', 'React', 'Data Science', 'Tailwind CSS'],
      experience_required: 'Intermediate',
      status: 'open',
      mentor_preference: 'ai',
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'dev-project-002',
      creator_id: 'dev-user-student-001',
      name: 'PeerPay Student Marketplace',
      description: 'A micro-transaction and campus marketplace enabling students to buy and sell textbooks, hardware kits, and tutoring sessions using PayPal.',
      domain: 'FinTech',
      deadline: '2027-01-20',
      team_size: 3,
      skills_required: ['React', 'Node.js', 'Payment APIs'],
      experience_required: 'Advanced',
      status: 'open',
      mentor_preference: 'industry',
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
  ],
  subscriptions: [
    {
      id: 'dev-sub-001',
      user_id: 'dev-user-student-001',
      tier: 'premium',
      plan_key: 'student_premium_monthly',
      paypal_subscription_id: 'DEV-MOCK-SUB-12345',
      status: 'ACTIVE',
      access_until: new Date(Date.now() + 86400000 * 30).toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  ai_usage: [
    { id: 'dev-usage-1', user_id: 'dev-user-student-001', action_type: 'analysis', created_at: new Date().toISOString() },
    { id: 'dev-usage-2', user_id: 'dev-user-student-001', action_type: 'matching', created_at: new Date().toISOString() },
  ],
  ai_analysis: [
    {
      id: 'dev-analysis-001',
      project_id: 'dev-project-001',
      identified_roles: ['Frontend Developer', 'Data Engineer', 'Sustainability Specialist'],
      skill_gaps: ['IoT Sensor Integration', 'Time-series Forecasting'],
      sustainability_notes: '[Local Dev Mode] Ensure energy-efficient edge processing and plan for sensor maintenance schedules.',
      recommended_mentor_type: 'Industry Expert',
      mentor_focus_areas: ['Cloud Data Pipelines', 'Environmental API Integrations'],
      mentor_guidance_notes: '[Local Dev Mode] An industry expert in cloud architectures will help structure the data pipeline for real-time telemetry processing.',
      created_at: new Date().toISOString(),
    },
  ],
  mentorship_requests: [],
  connections: [],
  direct_messages: [],
  events: [
    {
      id: 'dev-event-001',
      organizer_id: 'dev-user-organiser-001',
      name: 'National Inter-College AI Hackathon 2026',
      description: 'A 48-hour collaborative competition challenging students to build ethical AI and automated financial solutions.',
      domain: 'AI/ML',
      status: 'published',
      start_date: '2026-11-20',
      end_date: '2026-11-22',
      created_at: new Date().toISOString(),
    },
  ],
  event_participants: [],
  event_teams: [],
  mentor_profiles: [
    {
      id: 'dev-mentor-faculty-001',
      user_id: 'dev-user-faculty-001',
      full_name: 'Dr. Marcus Vance',
      photo_url: null,
      headline: 'Professor & AI Research Advisor',
      bio: 'Faculty professor providing academic and research mentorship on machine learning and computational algorithms.',
      location: 'Cambridge, MA',
      contact_email: 'marcus.vance@mit.edu',
      contact_preferences: { email: true, in_app: true },
      primary_category: 'college_professor',
      categories: ['college_professor'],
      institution_name: 'Department of Computer Science & AI',
      department: 'Computer Science',
      academic_designation: 'Professor & Department Chair',
      company_name: null,
      company_role: null,
      years_of_experience: 14,
      certifications: ['IEEE Senior Member', 'ACM Distinguished Scientist'],
      achievements: ['Published 30+ peer-reviewed papers on neural network optimization'],
      is_active: true,
      verification_status: 'verified',
      rejection_reason: null,
      verified_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      verified_by: 'dev-admin-system',
      offered_tiers: ['basic', 'standard', 'premium'],
      created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: 'dev-mentor-industry-002',
      user_id: 'dev-user-industry-002',
      full_name: 'Elena Rostova',
      photo_url: null,
      headline: 'Staff Software Architect & Cloud Advisor',
      bio: '10+ years building high-throughput payment systems and scaling consumer applications from seed to Series C.',
      location: 'New York, NY',
      contact_email: 'elena.rostova@cloudscale.io',
      contact_preferences: { email: true, in_app: true },
      primary_category: 'industry_expert',
      categories: ['industry_expert'],
      institution_name: null,
      department: null,
      academic_designation: null,
      company_name: 'CloudScale Systems',
      company_role: 'Staff Software Architect',
      years_of_experience: 11,
      certifications: ['AWS Certified Solutions Architect - Professional', 'CKA Kubernetes Administrator'],
      achievements: ['Scaled payment infrastructure processing 50M+ transactions monthly'],
      is_active: true,
      verification_status: 'verified',
      rejection_reason: null,
      verified_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      verified_by: 'dev-admin-system',
      offered_tiers: ['basic', 'standard', 'premium'],
      created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
    {
      id: 'dev-mentor-user-001',
      user_id: 'dev-user-student-001',
      full_name: 'Alex Rivera (Demo Student Mentor)',
      photo_url: null,
      headline: 'Full-Stack Developer & Peer Mentor',
      bio: 'Passionate about guiding junior peers through full-stack architecture, React patterns, and clean code.',
      location: 'San Francisco, CA',
      contact_email: 'student.dev@collivra.local',
      contact_preferences: { email: true, in_app: true },
      primary_category: 'industry_expert',
      categories: ['industry_expert'],
      institution_name: 'UC Berkeley',
      department: 'Electrical Engineering & Computer Science',
      academic_designation: 'Graduate Teaching Assistant',
      company_name: 'Open Source Fellow',
      company_role: 'Frontend Engineer',
      years_of_experience: 3,
      certifications: ['Meta Certified Frontend Developer'],
      achievements: ['Built collaborative campus learning tools with 5k+ student users'],
      is_active: true,
      verification_status: 'unverified',
      rejection_reason: null,
      verified_at: null,
      verified_by: null,
      offered_tiers: ['basic'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_expertise: [
    {
      id: 'dev-exp-001',
      mentor_id: 'dev-mentor-faculty-001',
      technical_skills: ['Python', 'Machine Learning', 'PyTorch', 'Data Structures', 'Algorithms'],
      domain_expertise: ['AI/ML', 'Data Science', 'Theoretical Computer Science'],
      research_interests: ['Neural Network Optimization', 'Graph Deep Learning', 'Algorithmic Complexity'],
      tech_stack: ['PyTorch', 'NumPy', 'Jupyter', 'Linux HPC'],
      industry_specializations: ['Higher Education', 'AI Research Labs'],
      mentorship_topics: ['Research Methodology', 'Algorithm Proofs', 'Graduate Thesis'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-exp-002',
      mentor_id: 'dev-mentor-industry-002',
      technical_skills: ['React', 'Node.js', 'System Architecture', 'PayPal REST APIs', 'Microservices', 'Docker', 'Kubernetes'],
      domain_expertise: ['FinTech', 'Cloud Infrastructure', 'Web Development'],
      research_interests: ['Distributed Consensus', 'Event-Driven Architectures'],
      tech_stack: ['Node.js', 'React', 'Docker', 'AWS', 'PostgreSQL', 'Redis'],
      industry_specializations: ['Payments', 'SaaS', 'High-Concurrency Backends'],
      mentorship_topics: ['Production Deployment', 'System Scalability', 'API Design'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-exp-003',
      mentor_id: 'dev-mentor-user-001',
      technical_skills: ['React', 'JavaScript', 'Tailwind CSS', 'Vite', 'Node.js'],
      domain_expertise: ['Web Development', 'UI/UX Design'],
      research_interests: ['Accessible Interfaces', 'Component Architectures'],
      tech_stack: ['React', 'Tailwind CSS', 'Vite', 'Supabase'],
      industry_specializations: ['EdTech', 'Frontend Engineering'],
      mentorship_topics: ['React Component Patterns', 'Frontend Architecture', 'Code Review'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_qualifications: [
    {
      id: 'dev-qual-001',
      mentor_id: 'dev-mentor-faculty-001',
      degree: 'Ph.D. in Computer Science',
      institution: 'Stanford University',
      field_of_study: 'Artificial Intelligence & Neural Computation',
      graduation_year: 2012,
      is_highest: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'dev-qual-002',
      mentor_id: 'dev-mentor-industry-002',
      degree: 'M.S. in Software Engineering',
      institution: 'Carnegie Mellon University',
      field_of_study: 'Distributed Systems',
      graduation_year: 2015,
      is_highest: true,
      created_at: new Date().toISOString(),
    },
  ],
  mentor_portfolio: [
    {
      id: 'dev-port-001',
      mentor_id: 'dev-mentor-faculty-001',
      title: 'GraphConv: Scalable Graph Convolution Framework',
      description: 'An open-source library for training deep graph models across distributed GPU clusters.',
      technologies: ['Python', 'C++', 'PyTorch', 'CUDA'],
      project_url: 'https://github.com/collivra-demo/graphconv',
      achievements: 'Over 2,000 GitHub stars and adopted by academic research institutions.',
      created_at: new Date().toISOString(),
    },
    {
      id: 'dev-port-002',
      mentor_id: 'dev-mentor-industry-002',
      title: 'High-Concurrency Payment Orchestration Engine',
      description: 'Zero-downtime transaction pipeline integrating multi-currency payment providers and webhook processing.',
      technologies: ['Node.js', 'PostgreSQL', 'Redis', 'Docker', 'AWS ECS'],
      project_url: 'https://cloudscale.io/case-studies/payments',
      achievements: 'Reduced checkout transaction latency by 45% under peak black-friday load.',
      created_at: new Date().toISOString(),
    },
  ],
  mentor_availability: [
    {
      id: 'dev-avail-001',
      mentor_id: 'dev-mentor-faculty-001',
      is_available: true,
      weekly_hours: 10,
      timezone: 'America/New_York',
      preferred_days: ['Tuesday', 'Thursday'],
      preferred_time_slots: ['Afternoon (2 PM - 5 PM)'],
      max_active_mentees: 4,
      current_active_mentees: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-avail-002',
      mentor_id: 'dev-mentor-industry-002',
      is_available: true,
      weekly_hours: 8,
      timezone: 'America/New_York',
      preferred_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['Evening (6 PM - 9 PM)'],
      max_active_mentees: 3,
      current_active_mentees: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-avail-003',
      mentor_id: 'dev-mentor-user-001',
      is_available: true,
      weekly_hours: 5,
      timezone: 'America/Los_Angeles',
      preferred_days: ['Saturday', 'Sunday'],
      preferred_time_slots: ['Morning (10 AM - 1 PM)'],
      max_active_mentees: 2,
      current_active_mentees: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_verification_documents: [
    {
      id: 'dev-doc-001',
      mentor_id: 'dev-mentor-faculty-001',
      document_type: 'faculty_id',
      document_url: 'https://credentials.mit.edu/verify/faculty-mvance',
      document_name: 'MIT Faculty ID & Department Directory Letter',
      notes: 'Verified via institutional MIT directory and academic staff directory.',
      status: 'approved',
      reviewed_by: 'dev-admin-system',
      reviewed_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      rejection_reason: null,
      created_at: new Date(Date.now() - 86400000 * 35).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: 'dev-doc-002',
      mentor_id: 'dev-mentor-industry-002',
      document_type: 'employment_proof',
      document_url: 'https://cloudscale.io/verify/erostova',
      document_name: 'CloudScale Systems Staff Architect Verification Letter',
      notes: 'Verified via corporate email and LinkedIn engineer reference.',
      status: 'approved',
      reviewed_by: 'dev-admin-system',
      reviewed_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      rejection_reason: null,
      created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
  ],
  mentor_packages: [
    {
      id: 'dev-pkg-fac-basic',
      mentor_id: 'dev-mentor-faculty-001',
      tier: 'basic',
      name: 'Academic Research Guidance (Basic)',
      description: 'Monthly 1:1 consultation, research literature recommendations, and algorithmic methodology review.',
      price_usd: 60.00,
      currency: 'USD',
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 1,
      chat_support: true,
      code_review: false,
      project_review: true,
      priority_support: false,
      benefits: ['1x 45-min monthly video session', 'Academic paper review notes', 'Asynchronous email Q&A'],
      limitations: ['No weekly live coding', 'Standard 48h response time'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-pkg-fac-standard',
      mentor_id: 'dev-mentor-faculty-001',
      tier: 'standard',
      name: 'Algorithm & Deep Learning Mentorship (Standard)',
      description: 'Bi-weekly research syncs, mathematical proof checks, and algorithm design coaching.',
      price_usd: 120.00,
      currency: 'USD',
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 2,
      chat_support: true,
      code_review: true,
      project_review: true,
      priority_support: false,
      benefits: ['2x 60-min sessions per month', 'Python / PyTorch algorithm code reviews', 'Capstone thesis guidance'],
      limitations: ['Weekend sessions subject to schedule'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-pkg-ind-standard',
      mentor_id: 'dev-mentor-industry-002',
      tier: 'standard',
      name: 'Cloud Architecture & Microservices (Standard)',
      description: 'Bi-weekly deep dive on Docker, AWS infrastructure, and scalable API design.',
      price_usd: 150.00,
      currency: 'USD',
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 2,
      chat_support: true,
      code_review: true,
      project_review: true,
      priority_support: true,
      benefits: ['2x 60-min architecture reviews', 'Production CI/CD pipeline guidance', 'Priority Discord/Slack chat'],
      limitations: [],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-pkg-user-basic',
      mentor_id: 'dev-mentor-user-001',
      tier: 'basic',
      name: 'Peer Full-Stack Starter',
      description: 'React and JavaScript mentorship for junior student projects.',
      price_usd: 25.00,
      currency: 'USD',
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 2,
      chat_support: true,
      code_review: true,
      project_review: false,
      priority_support: false,
      benefits: ['React component reviews', 'Friendly peer debugging sessions'],
      limitations: ['Student peer guidance only'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_subscriptions: [
    {
      id: 'dev-sub-001',
      student_id: 'dev-user-student-001',
      mentor_id: 'dev-mentor-faculty-001',
      package_id: 'dev-pkg-fac-basic',
      project_id: 'dev-project-001',
      status: 'active',
      billing_interval: 'monthly',
      price_paid: 60.00,
      current_period_start: new Date(Date.now() - 86400000 * 10).toISOString(),
      current_period_end: new Date(Date.now() + 86400000 * 20).toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    },
  ],
  mentor_subscription_history: [
    {
      id: 'dev-sub-hist-001',
      subscription_id: 'dev-sub-001',
      action: 'activated',
      from_status: 'pending_payment',
      to_status: 'active',
      notes: '[Demo Mode] Initial mentorship package subscription activated for student project.',
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    },
  ],
  mentor_bookings: [
    {
      id: 'dev-booking-001',
      student_id: 'dev-user-student-001',
      mentor_id: 'dev-mentor-faculty-001',
      package_id: 'dev-pkg-fac-basic',
      project_id: 'dev-project-001',
      subscription_id: 'dev-sub-001',
      status: 'confirmed',
      session_scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      session_duration_minutes: 60,
      meeting_link: 'https://meet.google.com/dev-collivra-academic-session',
      student_notes: 'Need guidance reviewing quantum convergence algorithm proofs.',
      mentor_notes: 'Confirmed. Please bring draft figures and convergence graphs.',
      proposed_alternative_times: [],
      rejection_reason: null,
      cancellation_reason: null,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    },
    {
      id: 'dev-booking-002',
      student_id: 'dev-user-student-001',
      mentor_id: 'dev-mentor-industry-002',
      package_id: 'dev-pkg-ind-standard',
      project_id: 'dev-project-001',
      subscription_id: null,
      status: 'awaiting_acceptance',
      session_scheduled_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      session_duration_minutes: 60,
      meeting_link: null,
      student_notes: 'Architecture review for Dockerized PayPal microservice.',
      mentor_notes: null,
      proposed_alternative_times: [],
      rejection_reason: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_payment_transactions: [
    {
      id: 'dev-tx-001',
      booking_id: 'dev-booking-001',
      student_id: 'dev-user-student-001',
      mentor_id: 'dev-mentor-faculty-001',
      paypal_order_id: 'PAYPAL-ORD-DEV-001',
      paypal_capture_id: 'PAYPAL-CAP-DEV-001',
      amount: 60.00,
      currency: 'USD',
      status: 'captured',
      idempotency_key: 'idemp-dev-001',
      metadata: { demo: true },
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ],
  mentor_workspace_notes: [
    {
      id: 'dev-note-001',
      booking_id: 'dev-booking-001',
      project_id: 'dev-project-001',
      mentor_id: 'dev-mentor-faculty-001',
      student_id: 'dev-user-student-001',
      author_id: 'dev-user-faculty-001',
      category: 'architecture',
      content: 'Recommended replacing dense adjacency matrices with sparse CSR representations to maintain sub-linear memory scaling under high graph vertex counts.',
      is_pinned: true,
      created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    },
    {
      id: 'dev-note-002',
      booking_id: 'dev-booking-001',
      project_id: 'dev-project-001',
      mentor_id: 'dev-mentor-faculty-001',
      student_id: 'dev-user-student-001',
      author_id: 'dev-user-student-001',
      category: 'action_item',
      content: 'Benchmark PyTorch Geometric sparse tensor module against custom CUDA kernel by Friday.',
      is_pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentorship_milestones: [
    {
      id: 'dev-milestone-001',
      project_id: 'dev-project-001',
      mentor_id: 'dev-mentor-faculty-001',
      student_id: 'dev-user-student-001',
      title: 'Algorithmic Complexity Proof Review',
      description: 'Review formal convergence bounds and mathematical lemmas with mentor.',
      due_date: '2026-11-28',
      status: 'in_progress',
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-milestone-002',
      project_id: 'dev-project-001',
      mentor_id: 'dev-mentor-faculty-001',
      student_id: 'dev-user-student-001',
      title: 'Literature Survey Benchmarking',
      description: 'Catalog baseline accuracy across 5 benchmark academic datasets.',
      due_date: '2026-11-20',
      status: 'completed',
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  mentor_reviews: [
    {
      id: 'dev-review-001',
      booking_id: 'dev-booking-001',
      mentor_id: 'dev-mentor-faculty-001',
      student_id: 'dev-user-student-001',
      rating: 5.0,
      review_title: 'Invaluable theoretical insights & research rigor',
      review_text: 'Dr. Vance provided exceptional clarity on algorithmic bottlenecks and guided us toward publication-quality experimental designs. Highly recommended!',
      is_public: true,
      created_at: new Date().toISOString(),
    },
  ],
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return {
    access_token: 'dev-mock-jwt-token',
    user: DEFAULT_STUDENT_USER,
  }
}

function setStoredSession(session) {
  try {
    if (session) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY)
    }
  } catch {
    // ignore
  }
}

class MockQueryBuilder {
  constructor(table) {
    this.table = table
    this.filters = []
    this.orderField = null
    this.orderAscending = true
    this.limitCount = null
    this.isSingle = false
    this.isMaybeSingle = false
    this.action = 'select'
    this.actionPayload = null
    this.selectColumns = '*'
  }

  select(columns = '*', options = {}) {
    this.selectColumns = columns
    if (options?.count) {
      this.returnCount = options.count
    }
    return this
  }

  insert(data) {
    this.action = 'insert'
    this.actionPayload = data
    return this
  }

  update(data) {
    this.action = 'update'
    this.actionPayload = data
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(field, value) {
    this.filters.push((row) => String(row[field]) === String(value))
    return this
  }

  neq(field, value) {
    this.filters.push((row) => String(row[field]) !== String(value))
    return this
  }

  in(field, values) {
    const set = new Set(values.map(String))
    this.filters.push((row) => set.has(String(row[field])))
    return this
  }

  or(filterStr) {
    if (!filterStr || typeof filterStr !== 'string') return this
    const parts = filterStr.split(',').map((p) => p.trim())
    const conditions = parts.map((part) => {
      const tokens = part.split('.')
      if (tokens.length >= 3) {
        const field = tokens[0]
        const op = tokens[1]
        const val = tokens.slice(2).join('.')
        return (row) => {
          if (op === 'eq') return String(row[field] ?? '') === String(val)
          if (op === 'neq') return String(row[field] ?? '') !== String(val)
          return false
        }
      }
      return () => false
    })
    this.filters.push((row) => conditions.some((cond) => cond(row)))
    return this
  }

  gte(field, value) {
    this.filters.push((row) => row[field] >= value)
    return this
  }

  lte(field, value) {
    this.filters.push((row) => row[field] <= value)
    return this
  }

  order(field, { ascending = true } = {}) {
    this.orderField = field
    this.orderAscending = ascending
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  maybeSingle() {
    this.isMaybeSingle = true
    return this
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this._execute()).then(onFulfilled, onRejected)
  }

  _execute() {
    if (!mockData[this.table]) {
      mockData[this.table] = []
    }

    const rows = mockData[this.table]

    if (this.action === 'insert') {
      const items = Array.isArray(this.actionPayload) ? this.actionPayload : [this.actionPayload]
      const inserted = items.map((item) => ({
        id: item.id || `dev-${this.table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        created_at: new Date().toISOString(),
        ...item,
      }))
      mockData[this.table].push(...inserted)
      const result = this.isSingle || this.isMaybeSingle
        ? inserted[0] || null
        : (Array.isArray(this.actionPayload) ? inserted : inserted[0])
      return { data: result, error: null }
    }

    if (this.action === 'update') {
      let matchedCount = 0
      for (const row of rows) {
        if (this.filters.every((f) => f(row))) {
          Object.assign(row, this.actionPayload)
          if (!this.actionPayload.id && row.id) {
            this.actionPayload.id = row.id
          }
          matchedCount++
        }
      }
      return { data: this.actionPayload, error: null, count: matchedCount }
    }

    if (this.action === 'delete') {
      mockData[this.table] = rows.filter((row) => !this.filters.every((f) => f(row)))
      return { data: null, error: null }
    }

    // Default SELECT
    let results = rows.filter((row) => this.filters.every((f) => f(row))).map((r) => {
      const cloned = { ...r }
      if (this.table === 'mentor_bookings' || this.table === 'mentor_subscriptions') {
        if (cloned.mentor_id) {
          cloned.mentor_profiles = mockData.mentor_profiles?.find((m) => m.id === cloned.mentor_id) || null
        }
        if (cloned.package_id) {
          cloned.mentor_packages = mockData.mentor_packages?.find((p) => p.id === cloned.package_id) || null
        }
        if (cloned.project_id) {
          cloned.projects = mockData.projects?.find((p) => p.id === cloned.project_id) || null
        }
        if (cloned.student_id) {
          cloned.student_profiles = mockData.student_profiles?.find((s) => s.id === cloned.student_id) || null
        }
      }
      return cloned
    })

    if (this.orderField) {
      results.sort((a, b) => {
        const valA = a[this.orderField] ?? ''
        const valB = b[this.orderField] ?? ''
        if (valA < valB) return this.orderAscending ? -1 : 1
        if (valA > valB) return this.orderAscending ? 1 : -1
        return 0
      })
    }

    if (this.limitCount !== null) {
      results = results.slice(0, this.limitCount)
    }

    if (this.isSingle) {
      return {
        data: results[0] || null,
        error: results[0] ? null : { message: 'Row not found in mock store' },
        count: results.length,
      }
    }

    if (this.isMaybeSingle) {
      return {
        data: results[0] || null,
        error: null,
        count: results.length,
      }
    }

    return {
      data: results,
      error: null,
      count: results.length,
    }
  }
}

export function createMockSupabaseClient() {
  console.info('%c[Collivra Local Dev Mode]%c Running with mock Supabase service layer. Real backend calls are simulated safely.', 'color: #D97706; font-weight: bold;', 'color: inherit;')

  const listeners = new Set()

  function notifyAuth(event, session) {
    for (const listener of listeners) {
      try {
        listener(event, session)
      } catch (err) {
        console.error('Auth listener error:', err)
      }
    }
  }

  return {
    isMock: true,
    auth: {
      async getSession() {
        const session = getStoredSession()
        return { data: { session }, error: null }
      },
      async getUser() {
        const session = getStoredSession()
        return { data: { user: session?.user || null }, error: null }
      },
      onAuthStateChange(callback) {
        listeners.add(callback)
        const session = getStoredSession()
        // Fire initially with current session
        setTimeout(() => callback('SIGNED_IN', session), 0)
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(callback),
            },
          },
        }
      },
      async signInWithPassword({ email, password }) {
        const accountType = email.toLowerCase().includes('organis') || email.toLowerCase().includes('admin')
          ? 'organiser'
          : 'student'
        const baseUser = accountType === 'organiser' ? DEFAULT_ORGANISER_USER : DEFAULT_STUDENT_USER
        const user = { ...baseUser, email: email || baseUser.email }
        const session = { access_token: 'dev-mock-jwt', user }
        setStoredSession(session)
        notifyAuth('SIGNED_IN', session)
        return { data: { user, session }, error: null }
      },
      async signUp({ email, password, options }) {
        const accountType = options?.data?.account_type || 'student'
        const user = {
          id: `dev-user-${Date.now()}`,
          email: email || 'student@collivra.local',
          user_metadata: { account_type: accountType },
          app_metadata: { provider: 'dev-mode' },
          role: 'authenticated',
        }
        const session = { access_token: 'dev-mock-jwt', user }
        setStoredSession(session)
        notifyAuth('SIGNED_IN', session)
        return { data: { user, session }, error: null }
      },
      async signOut() {
        setStoredSession(null)
        notifyAuth('SIGNED_OUT', null)
        return { error: null }
      },
      async resetPasswordForEmail(_email) {
        return { data: {}, error: null }
      },
      async signInWithOAuth({ provider }) {
        const session = { access_token: 'dev-mock-jwt', user: DEFAULT_STUDENT_USER }
        setStoredSession(session)
        notifyAuth('SIGNED_IN', session)
        window.location.href = '/dashboard'
        return { data: { provider, url: '/dashboard' }, error: null }
      },
      async updateUser(attributes) {
        const session = getStoredSession()
        if (session?.user) {
          Object.assign(session.user, attributes)
          setStoredSession(session)
        }
        return { data: { user: session?.user }, error: null }
      },
    },

    from(table) {
      return new MockQueryBuilder(table)
    },

    channel(_name) {
      return {
        on() {
          return this
        },
        subscribe(callback) {
          if (callback) callback('SUBSCRIBED')
          return this
        },
        unsubscribe() {},
      }
    },

    removeChannel() {},

    functions: {
      async invoke(name, { body } = {}) {
        if (name === 'analyze-mentor-requirements') {
          const analysis = analyzeMentorRequirementsRuleBased(body || {})
          analysis.analysis_source = 'AI'
          return {
            data: analysis,
            error: null,
          }
        }

        if (name === 'analyze-project') {
          return {
            data: {
              required_skills: [...new Set([...(body?.skills_required || []), 'React', 'Python', 'FastAPI', 'Tailwind CSS'])],
              identified_roles: ['Frontend Developer', 'Full-stack Engineer', 'AI/ML Specialist'],
              skill_gaps: ['Cloud Telemetry Integration', 'Real-time Payment Security'],
              experience_level: 'Intermediate',
              skill_priorities: ['Python', 'React', 'FastAPI'],
              project_complexity: 'Intermediate',
              reasoning: '[Local Dev Mode Simulation] The project requires frontend visualization combined with efficient model inference and robust API routing.',
              sustainability_notes: '[Local Dev Mode Simulation] Design for low-power edge data collection and establish regular validation cycles for datasets.',
              recommended_mentor_type: 'Industry Expert',
              mentor_focus_areas: ['Payment Gateway Architecture', 'Model Optimization', 'Production Scaling'],
              mentor_guidance_notes: '[Local Dev Mode Simulation] An experienced industry architect can provide best practices for secure transactions and cloud deployment.',
              source: 'ai',
              notice: '[Dev Mode] AI analysis simulated via local development service layer.',
            },
            error: null,
          }
        }

        if (name === 'match-students') {
          return {
            data: {
              matches: [
                {
                  id: 'dev-match-1',
                  student_id: 'dev-mentor-faculty-001',
                  score_percent: 94,
                  skill_overlap: ['Python', 'Machine Learning'],
                  notes: '[Local Dev Mode] Strong match for computational modeling and Python engineering.',
                },
                {
                  id: 'dev-match-2',
                  student_id: 'dev-mentor-industry-002',
                  score_percent: 88,
                  skill_overlap: ['React', 'Node.js'],
                  notes: '[Local Dev Mode] Strong frontend architecture and payment experience.',
                },
              ],
              source: 'ai',
              notice: '[Dev Mode] Student matches simulated via local development service layer.',
            },
            error: null,
          }
        }

        if (name === 'mentorship-manage') {
          const action = body?.action
          if (action === 'list' || action === 'match') {
            return {
              data: {
                mentors: [
                  {
                    id: 'dev-mentor-faculty-001',
                    name: 'Dr. Marcus Vance',
                    college: 'Department of Computer Science & AI',
                    experience: 'Advanced',
                    skills: ['Python', 'Machine Learning', 'PyTorch'],
                    topics: ['AI/ML', 'Research', 'Algorithms'],
                    bio: 'Faculty professor providing academic and research mentorship.',
                    score: 95,
                    overlap: ['Python', 'Machine Learning'],
                    notes: 'Excellent fit for AI/ML and core algorithmic architecture.',
                  },
                  {
                    id: 'dev-mentor-industry-002',
                    name: 'Elena Rostova',
                    college: 'Staff Engineer @ CloudScale',
                    experience: 'Advanced',
                    skills: ['React', 'Node.js', 'System Architecture', 'Payment APIs'],
                    topics: ['FinTech', 'Full-stack', 'System Architecture'],
                    bio: 'Staff engineer with 10+ years scaling payment infrastructures.',
                    score: 91,
                    overlap: ['React', 'Payment APIs'],
                    notes: 'Ideal advisor for production scaling, PayPal integration and frontend systems.',
                  },
                ],
                source: action === 'match' ? 'ai' : undefined,
                notice: '[Dev Mode] Mentor recommendations loaded from local development service layer.',
              },
              error: null,
            }
          }

          if (action === 'request') {
            return {
              data: { ok: true, notice: '[Dev Mode] Mentorship request created.' },
              error: null,
            }
          }

          return { data: { ok: true }, error: null }
        }

        if (name === 'subscription-manage') {
          return {
            data: {
              tier: 'premium',
              status: 'ACTIVE',
              planKey: 'student_premium_monthly',
              aiActionsRemaining: 150,
            },
            error: null,
          }
        }

        return { data: { ok: true, notice: `Simulated response for ${name}` }, error: null }
      },
    },
  }
}
