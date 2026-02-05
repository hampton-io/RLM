import React from 'react';
import { ArrowUpRight, Zap } from 'lucide-react';

/**
 * MyRnD Project Card Component
 * 
 * Displays information about MyRnD research.
 * Intended for use in MyRnD-related sites or documentation dashboards.
 */

interface MyRndCardProps {
  className?: string;
}

export const MyRndCard: React.FC<MyRndCardProps> = ({ className = '' }) => {
  return (
    <div className={`group block p-8 rounded-2xl bg-surface-900 border border-surface-800 hover:border-accent-300 transition-colors duration-300 ${className}`}>
      {/* Status badge */}
      <div className="flex items-center justify-between mb-6">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border bg-accent-300/10 text-accent-300 border-accent-300/30">
          <Zap className="w-3.5 h-3.5" />
          Live
        </span>
        <a 
          href="https://myrnd.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center group-hover:bg-accent-300 group-hover:border-accent-300 transition-all duration-300"
        >
          <ArrowUpRight className="w-4 h-4 text-surface-400 group-hover:text-surface-900 transition-colors" />
        </a>
      </div>

      {/* Title */}
      <h3 className="text-2xl md:text-3xl font-display text-surface-50 mb-3 group-hover:text-accent-300 transition-colors duration-300">
        MyRnD
      </h3>

      {/* Description */}
      <p className="text-surface-400 leading-relaxed mb-6">
        Open source AI research from Hampton.io. Multi-agent collaboration, unlimited context processing, and cognitive diversity.
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {['AI', 'Research', 'Open Source'].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 bg-surface-800/80 border border-surface-700 rounded-full text-xs text-surface-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

export default MyRndCard;
