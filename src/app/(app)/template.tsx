'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Page transition: each route enters with a soft rise and fade. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
