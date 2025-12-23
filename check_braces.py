#!/usr/bin/env python3
# -*- coding: utf-8 -*-

lines = open('src/pages/TimeLog.tsx', 'r', encoding='utf-8', errors='ignore').readlines()
depth = 0
total_opens = 0
total_closes = 0

checkpoints = [76, 2350, 2418, 2535, 2666, 2682, 2683, 2684, 2685, 2686, 2687, 2733, 2734, 2735, 2773, 2774]

for i, line in enumerate(lines, 1):
    opens = line.count('{')
    closes = line.count('}')
    depth += opens - closes
    total_opens += opens
    total_closes += closes
    
    if i in checkpoints:
        print(f'Line {i:4d}: depth={depth:3d}, opens={opens}, closes={closes} | {line.rstrip()[:70]}')

print(f'\nTotal: opens={total_opens}, closes={total_closes}, diff={total_opens - total_closes}')
