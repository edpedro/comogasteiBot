import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Compra } from '../compras/compra.entity';

@Entity('cartoes')
export class Cartao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ type: 'enum', enum: ['cartao', 'pix'] })
  tipo: 'cartao' | 'pix';

  @Column({ type: 'int', name: 'data_fechamento', nullable: true })
  dataFechamento: number;

  @Column({ type: 'decimal', nullable: true })
  limite: number;

  @Column({ type: 'bigint', name: 'chat_id', nullable: true })
  chatId: number;

  @OneToMany(() => Compra, (compra) => compra.cartao)
  compras: Compra[];
}
