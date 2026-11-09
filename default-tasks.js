/* ========================================
   EduPlanner — Built-in tasks
   Harmony Digital Consults Ltd · MIT License
   Pre-populated tasks by role and frequency (English; translations are in i18n.js).
   ======================================== */

(function () {
  'use strict';

  window.EDU_DEFAULT_TASKS = {
    teacher: {
      daily: [
        'Review lesson plan for today',
        'Take class attendance',
        'Update student progress notes',
        'Mark and return assignments',
        'Prepare materials for tomorrow\'s lessons',
        'Supervise student behavior during break',
        'Communicate updates to parents (if needed)'
      ],
      weekly: [
        'Submit weekly lesson notes to HOD',
        'Prepare and grade quizzes/tests',
        'Review scheme of work progress',
        'Attend staff meeting',
        'Update class register and records',
        'Plan differentiated activities for struggling students',
        'Organize classroom and resources'
      ],
      monthly: [
        'Submit monthly progress report',
        'Review and adjust lesson plans for next month',
        'Conduct parent-teacher communication',
        'Participate in professional development session',
        'Analyze student performance data',
        'Update cumulative records'
      ]
    },
    administrator: {
      daily: [
        'Review and respond to correspondence',
        'Monitor staff attendance and punctuality',
        'Handle student disciplinary issues',
        'Coordinate daily school operations',
        'Review financial transactions and petty cash',
        'Update school calendar if needed'
      ],
      weekly: [
        'Hold management team briefing',
        'Review budget expenditure report',
        'Monitor cleanliness and facility maintenance',
        'Review admission and enrollment status',
        'Coordinate extracurricular activities schedule',
        'Approve purchase orders and requisitions'
      ],
      monthly: [
        'Prepare monthly financial summary',
        'Conduct staff performance review meeting',
        'Submit regulatory compliance documents',
        'Organize school assembly or special event',
        'Review and update school policies',
        'Generate enrollment and attendance reports'
      ]
    },
    hod: {
      daily: [
        'Monitor teaching quality in department',
        'Review lesson delivery and classroom visits',
        'Address departmental issues promptly',
        'Ensure teaching aids are available'
      ],
      weekly: [
        'Hold departmental meeting',
        'Review and sign off on lesson notes',
        'Coordinate inter-class assessments',
        'Mentor and support new teachers',
        'Verify scheme of work compliance',
        'Plan department resource needs'
      ],
      monthly: [
        'Submit departmental performance report',
        'Analyze subject-wide student results',
        'Organize department training session',
        'Review and update department curriculum',
        'Evaluate resource utilization',
        'Set targets for the next month'
      ]
    },
    ict: {
      daily: [
        'Check all computer systems and devices',
        'Resolve IT support tickets',
        'Monitor internet connectivity',
        'Ensure projectors and displays are working',
        'Back up critical school data'
      ],
      weekly: [
        'Run system and software updates',
        'Conduct ICT training/support for staff',
        'Audit device inventory',
        'Test backup and recovery procedures',
        'Review network security logs',
        'Update school website or portal'
      ],
      monthly: [
        'Submit IT infrastructure status report',
        'Plan and procure technology supplies',
        'Conduct cybersecurity awareness session',
        'Review and update IT policies',
        'Evaluate software license renewals',
        'Prepare ICT integration plan for curriculum'
      ]
    },
    librarian: {
      daily: [
        'Open and organize library for the day',
        'Process book checkouts and returns',
        'Assist students with research and reading',
        'Shelve returned books properly',
        'Monitor library behavior and rules'
      ],
      weekly: [
        'Update library catalog and records',
        'Conduct reading promotion activity',
        'Check for overdue books and send reminders',
        'Organize reading corner and displays',
        'Coordinate with teachers on reference materials',
        'Inventory new book arrivals'
      ],
      monthly: [
        'Submit library usage statistics report',
        'Recommend new book purchases',
        'Organize book club or reading challenge',
        'Conduct library orientation for new students',
        'Review and repair damaged materials',
        'Plan library events and theme months'
      ]
    },
    counselor: {
      daily: [
        'Review student referral cases',
        'Conduct individual counseling sessions',
        'Follow up on at-risk students',
        'Document session notes and progress',
        'Coordinate with class teachers on concerns'
      ],
      weekly: [
        'Facilitate group counseling session',
        'Meet with parents of referred students',
        'Conduct classroom guidance lesson',
        'Review and update student case files',
        'Coordinate with external support agencies',
        'Attend student welfare meeting'
      ],
      monthly: [
        'Submit counseling activity report',
        'Organize wellness or life skills workshop',
        'Analyze referral patterns and trends',
        'Update counseling resources and materials',
        'Conduct peer mediation training',
        'Plan career guidance or orientation session'
      ]
    }
  };
})();
