// Russian texts for «Логические связки» (wording kept from v4.1).

import { BinaryOp } from '../../core/types';

const connector = (text: string) => `<div class="is-connector">${text}</div>`;

export function binaryConclusion(op: BinaryOp, a: string, b: string): string {
    switch (op) {
        case 'and': return `${connector('Верны оба:')}${a}${connector('и')}${b}`;
        case 'nand': return `${connector('Не оба верны:')}${a}${connector('и')}${b}`;
        case 'or': return `${connector('Верно')}${a}${connector('или')}${b}${connector('возможно оба')}`;
        case 'nor': return `${connector('Неверны оба:')}${a}${connector('и')}${b}`;
        case 'xor': return `${connector('Верно только одно:')}${a}${connector('или')}${b}`;
        case 'xnor': return `${a}${connector('и')}${b}${connector('либо оба верны, либо оба неверны')}`;
    }
}

export const BINARY_OP_NOTES: Record<BinaryOp, string> = {
    and: '«Верны оба» — верно, только если верны оба утверждения.',
    nand: '«Не оба верны» — верно, если неверно хотя бы одно утверждение.',
    or: '«Верно … или …, возможно оба» — верно, если верно хотя бы одно утверждение.',
    nor: '«Неверны оба» — верно, только если оба утверждения неверны.',
    xor: '«Верно только одно» — верно, если верно ровно одно утверждение.',
    xnor: '«Либо оба верны, либо оба неверны» — верно, если утверждения одинаковы по истинности.',
};
