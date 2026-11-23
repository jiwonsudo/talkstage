/** 로그인 창 머리의 기하 패턴. 같은 시드로 늘 같은 그림을 그려요. */
const COLORS = ['--blue', '--yellow', '--pink', '--red', '--green', '--orange', '--purple', '--ink'];

function makeRng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function PatternArt({ cols = 10, rows = 2, size = 48, seed = 7 }: { cols?: number; rows?: number; size?: number; seed?: number }) {
  const rnd = makeRng(seed);
  const S = size;
  const shapes: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * S, y = r * S, k = `${r}-${c}`;
      const bg = COLORS[Math.floor(rnd() * COLORS.length)];
      let fg = COLORS[Math.floor(rnd() * COLORS.length)];
      if (fg === bg) fg = '--surface';
      const fill = (v: string) => ({ fill: `var(${v})` });
      shapes.push(<rect key={`b${k}`} x={x} y={y} width={S} height={S} style={fill(bg)} />);
      const kind = Math.floor(rnd() * 5), rot = Math.floor(rnd() * 4) * 90;
      const t = `rotate(${rot} ${x + S / 2} ${y + S / 2})`;
      if (kind === 0) shapes.push(<path key={k} transform={t} d={`M${x} ${y + S}A${S} ${S} 0 0 1 ${x + S} ${y}V${y + S}Z`} style={fill(fg)} />);
      else if (kind === 1) shapes.push(<path key={k} transform={t} d={`M${x} ${y + S}A${S / 2} ${S / 2} 0 0 1 ${x + S} ${y + S}Z`} style={fill(fg)} />);
      else if (kind === 2) shapes.push(<circle key={k} cx={x + S / 2} cy={y + S / 2} r={S / 2 - 6} style={fill(fg)} />);
      else if (kind === 3) shapes.push(<g key={k} transform={t}><path d={`M${x} ${y}H${x + S / 2}V${y + S / 2}H${x}Z`} style={fill(fg)} /><path d={`M${x + S / 2} ${y + S / 2}A${S / 2} ${S / 2} 0 0 1 ${x + S} ${y + S}H${x + S / 2}Z`} style={fill(fg)} /></g>);
      else shapes.push(<path key={k} transform={t} d={`M${x} ${y}H${x + S}L${x} ${y + S}Z`} style={fill(fg)} />);
    }
  }
  return <svg viewBox={`0 0 ${cols * S} ${rows * S}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">{shapes}</svg>;
}
