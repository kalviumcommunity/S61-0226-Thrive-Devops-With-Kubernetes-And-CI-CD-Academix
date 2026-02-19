export type Lecture = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  image: string;
  publishedDate: string;
  views: string;
  aiSummary: string;
  keyConcepts: Array<{
    title: string;
    timestamp: string;
  }>;
};

export const lectures: Lecture[] = [
  {
    slug: "introduction-to-computer-science",
    title: "Introduction to Computer Science",
    description: "Learn the fundamentals of binary, algorithms, and logic.",
    duration: "10:45",
    image: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80",
    publishedDate: "March 15, 2024",
    views: "1.2k views",
    aiSummary: "Generating key points for quick review...",
    keyConcepts: [
      { title: "Distributed Consensus", timestamp: "02:14" },
      { title: "Latency Tolerance", timestamp: "05:33" },
      { title: "Fault Recovery", timestamp: "12:05" },
    ],
  },
  {
    slug: "advanced-data-structures",
    title: "Advanced Data Structures",
    description: "Deep dive into trees, graphs, and hash tables.",
    duration: "15:20",
    image: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=80",
    publishedDate: "April 02, 2024",
    views: "980 views",
    aiSummary: "Compiling a concise summary for faster revision...",
    keyConcepts: [
      { title: "Balanced Trees", timestamp: "03:12" },
      { title: "Graph Traversal", timestamp: "08:47" },
      { title: "Hash Collisions", timestamp: "13:29" },
    ],
  },
  {
    slug: "modern-web-frameworks",
    title: "Modern Web Frameworks",
    description: "Comparing React, Vue, and Angular in 2024.",
    duration: "12:10",
    image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
    publishedDate: "May 08, 2024",
    views: "1.5k views",
    aiSummary: "Building a side-by-side framework comparison summary...",
    keyConcepts: [
      { title: "Rendering Models", timestamp: "01:58" },
      { title: "State Management", timestamp: "06:11" },
      { title: "Performance Tradeoffs", timestamp: "10:42" },
    ],
  },
];
