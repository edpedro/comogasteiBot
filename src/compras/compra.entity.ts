import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Cartao } from '../cartoes/cartao.entity';

@Entity('compras')
export class Compra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  grupoId: string; // ID to link installments

  @Column({
    type: 'enum',
    enum: ['CREDITO', 'DEBITO', 'DINHEIRO', 'PIX'],
    default: 'CREDITO',
  })
  tipo: 'CREDITO' | 'DEBITO' | 'DINHEIRO' | 'PIX';

  @Column({ name: 'cartao_id', nullable: true })
  cartaoId: string;

  @ManyToOne(() => Cartao, (cartao) => cartao.compras)
  @JoinColumn({ name: 'cartao_id' })
  cartao: Cartao;

  @Column()
  nome: string; // quem comprou

  @Column()
  descricao: string;

  @Column('decimal')
  valor: number;

  @Column('decimal', { name: 'valor_parcela' })
  valorParcela: number;

  @Column('int')
  parcelas: number;

  @Column('int', { name: 'parcela_atual' })
  parcelaAtual: number;

  @Column({ type: 'date', name: 'data_compra' })
  dataCompra: Date;

  @Column({ type: 'time', name: 'hora_compra', nullable: true })
  horaCompra: string;

  @Column({ type: 'date', name: 'mes_referencia' })
  mesReferencia: Date;

  @Column({ default: false })
  cancelada: boolean;
}
