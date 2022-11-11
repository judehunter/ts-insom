// type X<T extends string> = T['length'];

import {Signature} from './utils';
import {
  AddIInstr,
  AddRInstr,
  BranchIf,
  BranchLinkInstr,
  Immediate,
  LabelInstr,
  MovIInstr,
  MovRInstr,
  Register,
  SubIInstr,
  SubRInstr,
} from './ast';
import {ParseProgram, ResolveLabels} from './parser';

type Adder<A, B, C> = [A, B, C] extends ['0', '0', '0']
  ? {result: '0'; carry: '0'}
  : [A, B, C] extends ['1', '0', '0'] | ['0', '1', '0'] | ['0', '0', '1']
  ? {result: '1'; carry: '0'}
  : [A, B, C] extends ['1', '1', '0'] | ['1', '0', '1'] | ['0', '1', '1']
  ? {result: '0'; carry: '1'}
  : {result: '1'; carry: '1'};

type Head<T> = T extends `${infer R extends '0' | '1'}${string}` ? R : never;

type Tail<T> = T extends `${'0' | '1'}${infer R extends string}`
  ? R extends ''
    ? never
    : R
  : never;

export type EvalAdd<A, B> = [Tail<A>, Tail<B>] extends [infer AU, infer BU]
  ? [AU, BU] extends [never, never]
    ? Adder<A, B, '0'>
    : EvalAdd<AU, BU> extends infer Rest extends {carry: any; result: any}
    ? Adder<Head<A>, Head<B>, Rest['carry']> extends infer Current extends {
        carry: any;
        result: any;
      }
      ? {
          result: `${Current['result']}${Rest['result']}`;
          carry: Current['carry'];
        }
      : never
    : never
  : never;

type OnesComplement<T> = T extends ''
  ? ''
  : T extends `0${infer Rest}`
  ? `1${OnesComplement<Rest>}`
  : T extends `1${infer Rest}`
  ? `0${OnesComplement<Rest>}`
  : never;

type TwosComplement<T> = EvalAdd<OnesComplement<T>, '00000001'>['result'];

type EvalSub<A, B> = EvalAdd<A, TwosComplement<B>>;

// type Test = EvalSub<'00000010', '00001000'>;

type Overwrite<A, B> = Omit<A, keyof B> & B;

type EvalAddRInstr<T, Ctx extends Context> = T extends AddRInstr<
  infer Rd,
  infer Rn,
  infer Rm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          Record<
            Rd,
            EvalAdd<Ctx['registers'][Rn], Ctx['registers'][Rm]>['result']
          >
        >,
        {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
      >;
    }
  : never;

type EvalAddIInstr<T, Ctx extends Context> = T extends AddIInstr<
  infer Rd,
  infer Rn,
  infer imm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          Record<Rd, EvalAdd<Ctx['registers'][Rn], imm>['result']>
        >,
        {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
      >;
    }
  : never;

type EvalSubIInstr<T, Ctx extends Context> = T extends SubIInstr<
  infer Rd,
  infer Rn,
  infer imm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          Record<Rd, EvalSub<Ctx['registers'][Rn], imm>['result']>
        >,
        {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
      >;
    }
  : never;

type EvalSubRInstr<T, Ctx extends Context> = T extends SubRInstr<
  infer Rd,
  infer Rn,
  infer Rm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          Record<
            Rd,
            EvalSub<Ctx['registers'][Rn], Ctx['registers'][Rm]>['result']
          >
        >,
        {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
      >;
    }
  : never;

type EvalMovIInstr<T, Ctx extends Context> = T extends MovIInstr<
  infer Rd,
  infer imm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
        >,
        Record<Rd, imm>
      >;
    }
  : never;

type EvalMovRInstr<T, Ctx extends Context> = T extends MovRInstr<
  infer Rd,
  infer Rm
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Overwrite<
          Ctx['registers'],
          {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
        >,
        Record<Rd, Ctx['registers'][Rm]>
      >;
    }
  : never;

type EvalBranchIfInstr<T, Ctx extends Context> = T extends BranchIf<
  infer type,
  infer Rn,
  infer address
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Ctx['registers'],
        {
          pc: Ctx['registers'][Rn] extends '00000000'
            ? type extends 'BranchIfZero'
              ? address
              : EvalAdd<Ctx['registers']['pc'], '00000001'>['result']
            : type extends 'BranchIfZero'
            ? EvalAdd<Ctx['registers']['pc'], '00000001'>['result']
            : address;
        }
      >;
    }
  : never;

type EvalBranchLinkInstr<T, Ctx extends Context> = T extends BranchLinkInstr<
  infer address
>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Ctx['registers'],
        {
          pc: address;
          lr: EvalAdd<Ctx['registers']['pc'], '00000001'>['result'];
        }
      >;
    }
  : never;

type EvalLabelInstr<T, Ctx extends Context> = T extends LabelInstr<string>
  ? {
      memory: Ctx['memory'];
      registers: Overwrite<
        Ctx['registers'],
        {pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result']}
      >;
    }
  : never;

type EvalInstr<T, Ctx extends Context> =
  | EvalAddIInstr<T, Ctx>
  | EvalAddRInstr<T, Ctx>
  | EvalMovIInstr<T, Ctx>
  | EvalMovRInstr<T, Ctx>
  | EvalLabelInstr<T, Ctx>
  | EvalBranchIfInstr<T, Ctx>
  | EvalSubIInstr<T, Ctx>
  | EvalSubRInstr<T, Ctx>
  | EvalBranchLinkInstr<T, Ctx>;

type Context = {
  registers: {
    r0: string;
    r1: string;
    r2: string;
    r3: string;
    r4: string;
    r5: string;
    r6: string;
    r7: string;
    sp: string;
    lr: string;
    pc: string;
  };
  memory: string[];
};

// type PickPC<T, PC> = T extends PC ? T : never;

type Find<Instrs, PC> = {
  [K in keyof Instrs]: Instrs[K] extends {idx: PC} ? Instrs[K] : never;
};

type Clean<Arr> = {
  [K in keyof Arr as K extends number ? K : never]: Arr[K];
}[any];

type CleanFind<Instrs, PC> = Clean<Find<Instrs, PC>>;

// type t = Clean<Find<[{idx: '0'}, {idx: '1'}], '1'>>;

type Eval<
  Instrs extends {idx: any}[],
  Ctx extends Context = {
    registers: {
      r0: '00000000';
      r1: '00000000';
      r2: '00000000';
      r3: '00000000';
      r4: '00000000';
      r5: '00000000';
      r6: '00000000';
      r7: '00000000';
      sp: '00000000';
      lr: '00000000';
      pc: '00000000';
    };
    memory: [];
  },
> = CleanFind<Instrs, Ctx['registers']['pc']> extends never
  ? Ctx
  : Eval<Instrs, EvalInstr<CleanFind<Instrs, Ctx['registers']['pc']>, Ctx>>;

// type Program = Eval<
//   ResolveLabels<
//     ParseProgram<`
//       MOV r0, #00000110
//       MOV r1, #11000110
//       mul:
//         CBZ r1, exit
//         ADD r2, r2, r0
//         SUB r1, r1, #00000001
//         B mul
//       exit:
//     `>
//   >
// >;

// type Program = Eval<
//   ResolveLabels<
//     ParseProgram<`
//       ADD r0, r0, #00000011
//       ADD r1, r0, r0
//       SUB r1, r1, #00000010
//       SUB r1, r1, r0
//       MOV r2, #00000010
//       MOV r2, r1
//     `>
//   >
// >;

// type Program = Eval<
//   ResolveLabels<
//     ParseProgram<`
//       MOV r0, #00000010
//       MOV r1, #00000001
//       BL add
//       B exit
//       add:
//         ADD r0, r0, r1
//         BR lr
//       exit:
//     `>
//   >
// >;

type Program = Eval<
  ResolveLabels<
    ParseProgram<`
      MOV r0, #00000110
      MOV r1, #11000110
      mul:
        CBZ r1, exit
        ADD r2, r2, r0
        SUB r1, r1, #00000001
        B mul
      exit:
    `>
  >
>;

type r0 = Program['registers']['r0'];
//   ^?
type r1 = Program['registers']['r1'];
//   ^?
type r2 = Program['registers']['r2'];
//   ^?

// type Test = Signature<Eval<
//   [
//     {
//       type: 'MovI';
//       Rd: 'r1';
//       imm: '00000001';
//       idx: '00000000';
//     },
//     {
//       type: 'MovI';
//       Rd: 'r1';
//       imm: '00000001';
//       idx: '00000001';
//     },
//   ]
// >>;

// > = Instrs[number] extends infer R
//   ? R extends infer B extends {idx: PC}
//     ? Eval<Instrs, EvalAdd<PC, '00000001'>['result']>
//     : PC
//   : never;

// type Eval<
//   Instrs extends any[],
//   Ctx extends Context = {
//     registers: {
//       r0: '00000000';
//       r1: '00000000';
//       r2: '00000000';
//       r3: '00000000';
//       r4: '00000000';
//       r5: '00000000';
//       r6: '00000000';
//       r7: '00000000';
//       sp: '00000000';
//       lr: '00000000';
//       pc: '00000001';
//     };
//     memory: [];
//   }
// > = {
//   [K in keyof Instrs as Instrs[K] extends {idx: Ctx['registers']['pc']}
//     ? K
//     : never]: Instrs[K];
// } extends infer R
//   ? R[keyof R] extends infer Cur
//     ? Cur extends never
//       ? never
//       : Eval<
//           [],
//           {
//             registers: {
//               r0: '00000000';
//               r1: '00000000';
//               r2: '00000000';
//               r3: '00000000';
//               r4: '00000000';
//               r5: '00000000';
//               r6: '00000000';
//               r7: '00000000';
//               sp: '00000000';
//               lr: '00000000';
//               pc: EvalAdd<Ctx['registers']['pc'], '00000001'>['result'];
//             };
//             memory: [];
//           }
//         >
//     : 'never'
//   : never;

// type XYZ = Eval<
//   [
//     {
//       type: 'MovI';
//       Rd: 'r1';
//       imm: '00000001';
//       idx: '00000000';
//     },
//   ]
// >;

// Instrs[number] & {idx: Ctx['registers']['pc']} extends infer Cur
// ? Cur extends never
//   ? Ctx
//   : Eval<Instrs, EvalInstr<Cur, Ctx>>
// : Ctx;

// type XXX = EvalAdd<'00000000', '00000010'>;
// type EvalTest = Eval<
//   [
//     {
//       type: 'ADD';
//       Rd: 'r0';
//       Rn: 'r1';
//       imm: '00000010';
//     },
//   ]
// >;