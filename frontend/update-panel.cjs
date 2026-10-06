const fs = require('fs');
const file = 'd:/Projetcs/Drishti-Himalaya/frontend/src/components/workspace/AnalysisPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add imports
code = code.replace(
  /import React, \{ useState \} from 'react';/,
  "import React, { useState } from 'react';\nimport { motion, AnimatePresence } from 'motion/react';"
);

// Wrap SegmentInspection with AnimatePresence and motion.div
code = code.replace(
  /\{\s*\/\* Section 0\.5[\s\S]*?\{selectedSegment && \([\s\S]*?<SegmentInspection[\s\S]*?\/>\s*\)\s*\}/,
  `{/* Section 0.5: Detailed Hazard Segment Inspection (UXMagic Frame 4) */}
        <AnimatePresence>
          {selectedSegment && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <SegmentInspection
                segment={selectedSegment}
                onClose={() => onSelectSegment?.(null)}
                onFocusMap={(seg) => onSelectSegment?.(seg)}
              />
            </motion.div>
          )}
        </AnimatePresence>`
);

// Add layout to Card components
code = code.replace(/<Card\s*variant=\"(default|elevated|muted)\"/g, '<Card layout variant="$1"');

// Change hotspot buttons to motion.button with layout
code = code.replace(
  /<button\s*key=\{hotspot\.id\}\s*type=\"button\"\s*className=\{clsx\('dh-analysis-panel__hotspot-row'/g,
  '<motion.button layout key={hotspot.id} type="button" className={clsx(\'dh-analysis-panel__hotspot-row\''
);
code = code.replace(
  /<\/span>\s*<\/div>\s*<\/button>\s*\);\s*\}\)\}/g,
  '</span></div></motion.button>);}}'
);

fs.writeFileSync(file, code);
