// Demo data used when the user hasn't connected a real Semantic Scholar ID
// yet, or when the backend is unreachable. Lets the UI be explored instantly.

export const demoResearcher = {
  id: 'demo-researcher',
  name: 'Dr. Ada Researcher',
  semantic_scholar_id: '1741101',
  h_index: 14,
  total_citations: 2380,
  paper_count: 22,
  updated_at: new Date().toISOString(),
};

export const demoPapers = [
  { id: 'p1', title: 'Scaling Laws for Neural Retrieval', year: 2023, citations: 210, venue: 'NeurIPS' },
  { id: 'p2', title: 'Efficient Attention for Long Contexts', year: 2022, citations: 180, venue: 'ICML' },
  { id: 'p3', title: 'A Survey of Citation Dynamics', year: 2021, citations: 150, venue: 'JMLR' },
  { id: 'p4', title: 'Graph Neural Networks for Science Mapping', year: 2021, citations: 96, venue: 'KDD' },
  { id: 'p5', title: 'Benchmarking Reproducibility in ML', year: 2020, citations: 88, venue: 'FAccT' },
  { id: 'p6', title: 'Low-Resource Transfer Learning', year: 2020, citations: 61, venue: 'ACL' },
  { id: 'p7', title: 'Interpretable Ranking Models', year: 2019, citations: 55, venue: 'SIGIR' },
  { id: 'p8', title: 'Federated Learning at Scale', year: 2019, citations: 40, venue: 'MLSys' },
  { id: 'p9', title: 'Robustness of Vision Transformers', year: 2018, citations: 33, venue: 'CVPR' },
  { id: 'p10', title: 'Causal Discovery in Time Series', year: 2018, citations: 28, venue: 'AAAI' },
  { id: 'p11', title: 'Sparse Mixture-of-Experts Models', year: 2017, citations: 22, venue: 'ICLR' },
  { id: 'p12', title: 'Self-Supervised Pretraining Objectives', year: 2017, citations: 18, venue: 'EMNLP' },
  { id: 'p13', title: 'Data Augmentation for Low-Resource NLP', year: 2016, citations: 15, venue: 'NAACL' },
  { id: 'p14', title: 'Knowledge Distillation Revisited', year: 2016, citations: 14, venue: 'ICML' },
  { id: 'p15', title: 'Curriculum Learning Strategies', year: 2015, citations: 13, venue: 'AISTATS' },
  { id: 'p16', title: 'Metric Learning for Retrieval', year: 2015, citations: 12, venue: 'SIGIR' },
  { id: 'p17', title: 'Bayesian Optimization for Hyperparameters', year: 2014, citations: 11, venue: 'NeurIPS' },
  { id: 'p18', title: 'Adversarial Examples in Practice', year: 2014, citations: 8, venue: 'ICLR' },
  { id: 'p19', title: 'Active Learning for Annotation', year: 2013, citations: 5, venue: 'ACL' },
  { id: 'p20', title: 'Ensembling Weak Classifiers', year: 2013, citations: 3, venue: 'AAAI' },
  { id: 'p21', title: 'Early Work on Word Embeddings', year: 2012, citations: 2, venue: 'EMNLP' },
  { id: 'p22', title: 'Position Paper on Reproducibility', year: 2012, citations: 1, venue: 'Workshop' },
];

export const demoHistory = [
  { recorded_at: '2021-01-01', h_index: 8, total_citations: 900 },
  { recorded_at: '2021-07-01', h_index: 9, total_citations: 1150 },
  { recorded_at: '2022-01-01', h_index: 10, total_citations: 1420 },
  { recorded_at: '2022-07-01', h_index: 11, total_citations: 1700 },
  { recorded_at: '2023-01-01', h_index: 12, total_citations: 1950 },
  { recorded_at: '2023-07-01', h_index: 13, total_citations: 2150 },
  { recorded_at: '2024-01-01', h_index: 14, total_citations: 2380 },
];
